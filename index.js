var crypto = require("crypto");
var RSA = require('node-rsa');
var archiver = require("archiver");
var Promise = require('es6-promise').Promise;

/**
 * 生成 private key
 *
 * @returns {Buffer} private key buffer
 */
function generatePrivateKey() {

  var key = new RSA({b: 1024});

  return key.exportKey('pkcs1-private-pem');

}

/**
 * 生成 public key
 *
 * @param {Buffer} privateKey
 * @returns {Buffer} public key buffer
 */
function generatePublicKey(privateKey) {

  var key = new RSA(privateKey);

  return key.exportKey('pkcs8-public-der');
}


/**
 * 生成 signature
 *
 * @param {Buffer} contents
 * @param {Buffer} privateKey
 * @returns {Buffer} signature buffer
 */
function generateSignature(contents, privateKey) {
  return new Buffer(
    crypto
      .createSign("sha1")
      .update(contents)
      .sign(privateKey),
    "binary"
  );
}

function generatePackage(signature, publicKey, contents) {
  var keyLength = publicKey.length;
  var sigLength = signature.length;
  var zipLength = contents.length;
  var length = 16 + keyLength + sigLength + zipLength;

  var crx = new Buffer(length);

  crx.write("Cr24" + new Array(13).join("\x00"), "binary");

  crx[4] = 2;
  crx.writeUInt32LE(keyLength, 8);
  crx.writeUInt32LE(sigLength, 12);

  publicKey.copy(crx, 16);
  signature.copy(crx, 16 + keyLength);
  contents.copy(crx, 16 + keyLength + sigLength);

  return crx;
}

/**
 * 用 zip 打包生成插件主体内容
 *
 * @param {Array} fileList
 * @returns {Promise}
 */

function generateContent(fileList) {
  var archive = archiver("zip");

  return new Promise(function (resolve, reject) {
    var contents = new Buffer('');

    fileList.forEach(function (file) {
      var filepath = file.getHashRelease().substring(1);

      archive.append(file.getContent(), {
        name: filepath
      });
    });

    archive.finalize();

    archive.on('readable', function () {
      var buf = archive.read();

      if (buf) {
        contents = Buffer.concat([contents, buf]);
      }
    });

    archive.on('finish', function () {
      resolve(contents);
    });

    archive.on("error", reject);
  });
}

/**
 * 生成 App ID
 *
 * @param {Buffer} publicKey
 * @returns {String}
 */

function generateAppId(publicKey) {

  if (typeof publicKey !== 'string' && !(publicKey instanceof Buffer)) {
    throw new Error('Public key is neither set, nor given');
  }
  return crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .slice(0, 32)
    .replace(/./g, function (x) {
      return (parseInt(x, 16) + 10).toString(26);
    });
}

/**
 * 生成更新信息 XML
 *
 * @param {String} appId
 * @param {String} codebase
 * @param {String} version
 * @returns {Buffer}
 */
function generateUpdateXML(appId, codebase, version) {

  return new Buffer(
    "<?xml version='1.0' encoding='UTF-8'?>\n" +
    "<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>\n" +
    "  <app appid='" + appId + "'>\n" +
    "    <updatecheck codebase='" + codebase + "' version='" + version + "' />\n" +
    "  </app>\n" +
    "</gupdate>"
  );
}

/**
 *
 * @param options 选项
 * @param options.filename 生成插件的文件名（可选）
 * @param options.privateKey 私钥（可选）
 * @param options.joinVersion 插件的文件名带上版本号的连字符（可选）
 * @param options.codebase 自动更新远程地址（可选）
 * @param modified
 * @param total
 * @param next
 * @returns {boolean}
 */
module.exports = function (options, modified, total, next) {

  var list = total;

  if (!list.length) {
    fis.log.error('No project files!');
    return false;
  }

  // 插件文件名
  var fileName = (options.fileName || 'extension').replace(/\.crx$/ig, '');
  // 插件文件名和版本号的连字符
  var joinVersion = options.joinVersion;
  // 私钥路径
  var privateKeyPath = options.privateKey;
  // 自动更新的 codebase
  var codebase = options.codebase;
  // 项目根目录
  var root = fis.project.getProjectPath();

  // 查找 manifest.json
  var manifestList = fis.util.find('.', [/\/manifest\.json$/i], null);

  if (manifestList.length === 0) {
    fis.log.error('Can not find manifest.json! Is it a Chrome extension project?');
    return false;
  }

  if (manifestList.length > 1) {
    fis.log.error('It can be only one manifest.json in the project.');
    return false;
  }

  // 读取 manifest.json
  var manifestObj = fis.util.readJSON(manifestList[0]);
  // 版本
  var version = manifestObj.version;
  // 是否需要连上版本号
  if (joinVersion) fileName = [fileName, version].join(joinVersion);

  // 私钥
  var privateKeyFile = fis.file(root, privateKeyPath || 'extension.pem');
  // 如果没有私钥，生一个
  if (!privateKeyPath) {
    privateKeyFile.setContent(generatePrivateKey());
  }
  var privateKeyContent = privateKeyFile.getContent();


  // 插件生成流程
  generateContent(list).then(function (content) {

    var publicKey = generatePublicKey(privateKeyContent);
    var signature = generateSignature(content, privateKeyContent);
    var crxPackage = generatePackage(signature, publicKey, content);

    var crxFile = fis.file(root, fileName + '.crx');
    crxFile.setContent(crxPackage);


    // 清空文件列表
    modified.splice(0, modified.length);
    total.splice(0, total.length);

    // add crxFile
    modified.push(crxFile);
    total.push(crxFile);

    // 按需 add privateKey
    if (!privateKeyPath) {
      modified.push(privateKeyFile);
      total.push(privateKeyFile);
    }

    // 按需生成更新 XML，看 manifest.json 里的 update_url 是否存在
    if (manifestObj.update_url) {
      // App ID
      var appId = generateAppId(publicKey);
      // update_url 的 FIS Ext 对象
      var updateUrlExt = fis.util.ext(manifestObj.update_url);
      // 根据 update_url 获得 update XML 的文件名
      var updateXML = updateUrlExt.basename;
      var updateXMLFile = fis.file(root, updateXML);
      // 获取 codebase 路径
      var codebaseUrl = codebase || updateUrlExt.dirname;

      var xmlContent = generateUpdateXML(appId, fis.util.pathinfo(codebaseUrl, fileName + '.crx').fullname, version);
      updateXMLFile.setContent(xmlContent);

      modified.push(updateXMLFile);
      total.push(updateXMLFile);
    }


    next();

  });
};
