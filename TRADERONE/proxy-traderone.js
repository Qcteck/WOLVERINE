const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function(app){
  // /wolverine/traderone/api/*  ->  http://127.0.0.1:9696/api/*
  app.use(
    "/wolverine/traderone/api",
    createProxyMiddleware({
      target: "http://127.0.0.1:9696",
      changeOrigin: true,
      pathRewrite: (path) => path.replace(/^\/wolverine\/traderone\/api/, "/api"),
      logLevel: "silent",
    })
  );
};
