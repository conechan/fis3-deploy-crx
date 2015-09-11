# fis3-deploy-crx

FIS3 deploy 阶段生成 Chrome 插件 *.crx 文件。

Heavily borrow codes from https://github.com/oncletom/crx[https://github.com/oncletom/crx]. Thanks oncletom[https://github.com/oncletom/]!

## 安装

```bash
npm install -g fis3-deploy-crx
```

或者本地安装到项目所在目录。

```bash
npm install fis3-deploy-crx
```

## 配置

```javascript
fis.media('crx')
  .match('**', {
    deploy: [
        fis.plugin('crx', {
          //fileName: 'cone.crx',
          //privateKey: '/cone.pem',
          //joinVersion: '-',
          //codebase: 'http://cone.cc/chrome/'
        }),
        fis.plugin('local-deliver', {
          to: './output'
        })
      ]
  });
```

## 配置说明

* `fileName`：可选，默认为 `extension.crx`，用来配置插件的文件名。
* `privateKey`：可选，默认生成新的私钥 `extension.pem`，用来配置插件的私钥。
* `joinVersion`：可选，默认为不添加版本号，用来配置一个连字符，连接插件文件名和版本号。例如配置 `joinVersion: '-'`，即生成插件命名为 `extension-0.0.1.crx`。
* `codebase`：可选，默认读取 `manifest.json` 里的 `update_url` 的路径，如果没有配置 `update_url`，则不会生效。详见：https://developer.chrome.com/extensions/autoupdate[https://developer.chrome.com/extensions/autoupdate]
