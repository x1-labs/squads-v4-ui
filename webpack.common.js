const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js', // Unique file name per build
    // chunkFilename: '[name].[contenthash].js', // Ensure chunks get unique names
    clean: true,
    assetModuleFilename: 'assets/[hash][ext][query]',
    pathinfo: false,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json', '.mjs'],
    plugins: [new TsconfigPathsPlugin()],
    fallback: {
      assert: require.resolve('assert/'),
      util: require.resolve('util/'),
      events: require.resolve('events/'),
      process: require.resolve('process/browser'),
      buffer: require.resolve('buffer/'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      vm: require.resolve('vm-browserify'),
    },
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'dayjs/plugin/relativeTime': path.resolve(__dirname, 'node_modules/dayjs/plugin/relativeTime.js'),
      'dayjs/plugin/utc': path.resolve(__dirname, 'node_modules/dayjs/plugin/utc.js'),
      'process/browser': path.resolve(__dirname, 'node_modules/process/browser.js'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'public/index.html',
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
};
