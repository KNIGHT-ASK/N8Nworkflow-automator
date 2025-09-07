const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
	mode: isProd ? 'production' : 'development',
	devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
	entry: {
		background: path.resolve(__dirname, 'background', 'service-worker.js'),
		popup: path.resolve(__dirname, 'popup', 'index.js'),
		content: path.resolve(__dirname, 'content', 'index.js'),
		sidebar: path.resolve(__dirname, 'sidebar', 'index.js')
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].bundle.js',
		clean: true
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				exclude: /node_modules/,
				use: 'ts-loader'
			},
			{
				test: /\.jsx?$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: [
							['@babel/preset-env', { targets: 'defaults' }],
							['@babel/preset-react', { runtime: 'automatic' }]
						]
					}
				}
			}
		]
	},
	resolve: {
		extensions: ['.tsx', '.ts', '.js', '.jsx']
	}
}; 