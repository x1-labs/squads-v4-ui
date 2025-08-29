const webpack = require("webpack");
const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const path = require("path");
const net = require("net");

async function getAvailablePort(startPort = 3000) {
    return new Promise((resolve) => {
        const checkPort = (port) => {
            const server = net.createServer();
            server.once("error", (err) => {
                if (err.code === "EADDRINUSE") {
                    console.log(`Port ${port} is in use, trying ${port + 1}...`);
                    checkPort(port + 1);
                } else {
                    resolve(port);
                }
            });
            server.once("listening", () => {
                server.close();
                resolve(port);
            });
            server.listen(port);
        };
        checkPort(startPort);
    });
}

module.exports = async () => {
    const port = await getAvailablePort(3000);
    console.log(`Starting dev server on port ${port}`);
    
    return merge(common, {
        mode: "development",
        devServer: {
            static: {
                directory: path.resolve(__dirname, "public"),
                publicPath: "/",
            },
            historyApiFallback: true,
            hot: true,
            port: port,
        },
    });
};
