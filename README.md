# ModelRate Radar

ModelRate Radar 是一个全球 AI 订阅价格监测网页，用于比较 OpenAI ChatGPT 与 Anthropic Claude 在不同国家和地区的本地订阅价格、年付价格和美元折算结果。

在线访问：[modelrate-radar.vercel.app](https://modelrate-radar.vercel.app)

## 主要功能

- 收录 ISO 3166-1 的 249 个国家与地区。
- 自动采集不同 Apple App Store storefront 的当地订阅价格。
- 展示 OpenAI 与 Anthropic 的个人订阅级别。
- 同时展示月付、年付总价、折合月价与折扣。
- 按订阅价格从低到高排序。
- 汇总每个套餐当前可比的最低价格。
- 在浏览器本地保存最近价格、简单历史记录和降价提醒规则。
- 使用实时汇率将当地价格折算为美元，方便跨地区比较。

## 当前套餐

### OpenAI

- Go
- Plus
- Pro 5x
- Pro 20x

### Anthropic

- Pro
- Max 5x
- Max 20x
- Team

## 数据口径

- 当地价格主要来自对应国家或地区的 Apple App Store 公开应用内购买项目。
- Anthropic Max 最低价卡片同时参考 Anthropic 官网公开价格；全球明细表中的金额仍标注为 iOS 实时价。
- 汇率来自公开汇率接口，并保留内置快照作为临时回退。
- 税费、支付渠道、App Store 加价和实时汇率会造成官网价与当地商店价不同。
- 页面数据仅供价格比较，不构成购买建议；实际价格以官方结账页面为准。

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

开发服务器启动后，按终端提示打开本地网址。

## 构建与测试

```bash
npm run build
npm test
```

`npm run build` 会生成前端资源和 Sites Worker；`npm test` 会同时验证构建、价格解析和后端接口逻辑。

## 可选环境变量

项目在不连接数据库时也可运行，价格和提醒数据保存在当前浏览器。若需要持久化历史、定时任务或邮件提醒，可参考 [`.env.example`](./.env.example) 配置 Supabase 与 Resend。

## 合规说明

项目不自动创建第三方账号，也不用于绕过地区、身份、支付或服务条款限制。注册和购买时请使用真实所在地、有效邮箱及符合平台要求的支付方式。

## 技术栈

- React
- Vite
- Cloudflare Worker / Sites Runtime
- Supabase（可选）
- Resend（可选）

## License

当前仓库尚未附带开源许可证。未经许可，请勿将代码用于商业再分发。
