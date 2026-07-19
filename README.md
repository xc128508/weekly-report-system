# Weekly Report System

一个轻量级实习生日报、周报和任务管理系统，适合小团队用来跟踪每日进展、周报提交、任务认领和反馈闭环。

## 功能概览

- 实习生：填写日报、认领任务、填写/修改周报、查看反馈。
- 管理员：查看日报提交情况，管理任务总表和部门，分类维护实习生、正式员工、管理员账号，导出数据。
- 负责人：查看周报，查看任务总表，反馈周报，查看需要支持事项。
- 周报支持：保存草稿、提交、自动保存本地草稿、按角色隔离访问。
- 部署支持：可直接使用 Docker Compose 部署。

## 技术栈

- Node.js
- Express
- express-session
- bcryptjs
- Docker / Docker Compose
- JSON 文件存储

## 目录结构

```text
.
├── src/
│   ├── server.js
│   ├── db/
│   ├── routes/
│   ├── services/
│   └── views/
├── public/
├── data/
│   └── db.example.json
├── Dockerfile
├── compose.yaml
└── package.json
```

## 本地运行

```bash
npm install
npm start
```

默认访问地址：

```text
http://localhost:8082/login
```

## Docker 部署

```bash
docker compose up -d --build
docker compose ps
```

默认容器端口映射：

```text
宿主机 10100 -> 容器 8082
```

访问地址：

```text
http://服务器IP:10100/login
```

## 数据文件

真实业务数据默认挂载到：

```text
/app/data
```

仓库不会提交真实数据文件。请使用 `data/db.example.json` 作为初始化结构参考。

## 默认账号

首次初始化时会自动创建示例账号：

```text
admin / admin123
boss / boss123
zhangsan / 123456
lisi / 123456
```

正式使用前请立即登录系统修改默认密码。

## 安全提醒

- 不要提交 `.env`、真实数据库、接口 token、日志和备份文件。
- 生产环境请配置强 `SESSION_SECRET`。
- 建议定期备份 `data/db.json`。
- 对外开放前请确认服务器防火墙只放行必要端口。

## 常用命令

查看容器：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs --tail=120
```

重启服务：

```bash
docker compose restart
```

验证服务：

```bash
curl -I http://127.0.0.1:10100/login
```
