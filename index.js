var log = require('winston'),
	async = require('async'),
	fs = require('fs'),
	path = require('path'),
	Table = require('cli-table'),
	BTCE = require('btce');

// read current balance and print it out
var currency = 'usd', asset = 'ltc';

// get
var btce = new BTCE();

var readline = require('readline');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


function getFunds(callback) {
	btce.getInfo(function(err, data) {
		if (err) {
			log.error('GetInfo: ' + err);
			return callback(err);
		}
		if (data && data.success) {
			// look up fund in asset
			if (data.return && data.return.funds) {
				var value = data.return.funds['usd'];
				var ltc = data.return.funds['ltc'],
					btc = data.return.funds['btc'];
				var table = new Table();
				table.push({"USD": value}, {"LTC": ltc}, {"BTC": btc});
				console.log(table.toString());
				callback();
			}
		} else {
			callback(data.error);
		}
	});
}

function testConfig(callback) {
	getFunds(function(err) {
		if (err) {
			console.log('Failed to talk to BTCE: ' + err);
			return callback(err);
		}
		callback();
	});
}

function getConfigFile(callback, retries) {
	if (!retries) {
		retries = 0;
	}

	if (retries >= 3) {
		return callback('invalid config');
	}

	var configFolder = path.join(process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE, '.cli-trader'),
		configPath = path.join(configFolder, 'config.json');
	var config = {};
	if (!fs.existsSync(configPath)) {
		console.log('Configuration not found! Creating new configuration in ' + configPath);
		// prompt user for config and write to disk
		rl.question('Enter BTCE API Key: ', function(answer) {
			config.apiKey = answer.trim();
			rl.question('Enter BTCE API Secret: ', function(answer) {
				config.apiSecret = answer.trim();
				btce.key = config.apiKey;
				btce.secret = config.apiSecret;
				// now test api
				getFunds(function(err) {
					if (err) {
						console.log('Failed to talk to BTCE: ' + err);
						console.log();
						return getConfigFile(callback, ++retries);
					}
					// write to disk
					console.log('Configuration successful! Writing to ' + configPath);
					if (!fs.existsSync(configFolder)) {
						fs.mkdirSync(configFolder,0600);
					}
					fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0600 } );
					callback();
				});
			});
		});
	} else {
		// config does exist!
		config = require(configPath);
		btce.key = config.apiKey;
		btce.secret = config.apiSecret;
		// now test api
		testConfig(function(err) {
			if (err) {
				// config is no longer valid!
				console.log('Configuration file contains invalid settings, deleting...');
				console.log();
				fs.unlinkSync(configPath);
				config = {};
				return getConfigFile(callback, ++retries);
			} else {
				callback();
			}
		});
	}
}

rl.setPrompt('btce > ');

getConfigFile(function(err) {
	if (err) {
		console.log('Failed to get configuration, exiting.');
		return process.exit(-1);
	}
	console.log('');
	rl.prompt();
});


function toFixed( number, precision ) {
    var multiplier = Math.pow( 10, precision );
    return Math.floor( number * multiplier ) / multiplier;
}

function trade(type, asset, rate, value, quantity) {
	//console.log(type + ' ' + quantity + ' ' + asset + ' @ ' + rate + ' = ' + value);
	async.auto({
		total_currency: function(callback) {
			if (type==='sell') {
				return callback();
			}
			// get the currency value
			btce.getInfo(function(err, data) {
				if (err) {
					return callback(err);
				}
				if (data && data.success) {
					if (data.return && data.return.funds) {
						var usd = data.return.funds['usd'];
						return callback(null, usd);
					}
				}
				return callback('usd not found!');
			});
		},
		total_asset: function(callback) {
			if (type==='buy') {
				return callback();
			}
			btce.getInfo(function(err, data) {
				if (err) {
					return callback(err);
				}
				if (data && data.success) {
					if (data.return && data.return.funds) {
						var usd = data.return.funds[asset];
						return callback(null, usd);
					}
				}
				return callback(asset + ' not found!');
			});
		},
		check_balance: ['total_currency', function(callback, results) {
			if (type==='buy' && value && results.total_currency < value) {
				return callback('insufficient funds');
			}
			callback();
		}],
		check_quantity: ['total_asset', function(callback, results) {
			if (type==='sell' && quantity && results.total_asset < quantity) {
				return callback('insufficient ' + asset + ' ' + results.total_asset + ' < ' + quantity);
			}
			callback();
		}],
		value: ['total_currency', function(callback, results) {
			if (!value && type==='buy') {
				callback(null, results.total_currency);
			} else {
				callback(null, value);
			}
		}],
		rate: function(callback) {
			if (!rate) {
				btce.ticker({ pair: asset + '_usd' }, function(err, data) {
					if (err) {
						return callback(err);
					}
					callback(null, data.ticker.sell);
				});
			} else {
				callback(null, Number(rate));
			}
		},
		quantity: ['check_balance', 'rate', 'value', 'check_quantity', function(callback, results) {
			// if selling, quantity is equal to value/rate or specified quantity, or all asset
			// if buying, quantity is equal to value/rate or specified quantity, or all currency
			if (quantity) {
				return callback(null, quantity);
			}
			if (results.value) {
				return callback(null, results.value/results.rate);
			} else {
				if (type==='sell') {
					return callback(null, results.total_asset);
				} else {
					return callback(null, results.total_currency);
				}
			}
		}],
		confirm: ['quantity', function(callback, results) {
			var quantity = results.quantity,
				totalCurrency = quantity*results.rate;
			console.log(type.toUpperCase() + ': ' + quantity.toFixed(5) + "" + asset + ' @ ' + toFixed(results.rate,5) + ' = ' + toFixed(totalCurrency,5));
			rl.question('Are you sure you want to ' + type + '?: ', function(answer) {
				if (answer.match(/^y(es)?$/i)) {
					return callback(null, true);
				}
				callback(null, false);
			});
		}],
		trade: ['confirm', function(callback, results) {
			if (results.confirm) {
				// do the purchase...
				var quantity = results.quantity,
					rate = results.rate,
					params = {'pair': asset + '_usd', 'type': type, 'rate': toFixed(rate,5), 'amount': toFixed(quantity,5)};
				//console.log('Making trade: ' + JSON.stringify(params)); callback(null, true);
				btce.trade(params, function(err, data) {
					if (err) {
						console.log('ERR: ' + JSON.stringify(err));
						return callback(err);
					}
					if (data && data.success) {
						console.log('Order ' + data.return.order_id + ' placed.');
						if (data.return && data.return.funds) {
							var value = data.return.funds['usd'];
							var ltc = data.return.funds['ltc'],
								btc = data.return.funds['btc'];
							var table = new Table();
							table.push({"USD": value}, {"LTC": ltc}, {"BTC": btc});
							console.log(table.toString());
						}
					} else {
						console.log('Failed to place order : ' + data.error);
					}
					return callback(null, true);
				});
			} else {
				return callback();
			}
		}]
	}, function(err, results) {
		if (err) {
			console.log(err);
		}
		return rl.prompt();
	});
}
function buy(line) {
	var regex = {
		allIn: /^buy\s(ltc|btc)$/,
		quantityRate: /^buy\s([0-9]+\.?[0-9]*)\s(ltc|btc)\s?\@\s?([0-9]+\.?[0-9]*)$/,
		quantity: /^buy\s([0-9]+\.?[0-9]*)\s(ltc|btc)$/,
		atValue: /^buy\s(ltc|btc)\s?\=\s?([0-9]+\.?[0-9]*)$/,
		atRate: /^buy\s(ltc|btc)\s?\@\s?([0-9]+\.?[0-9]*)$/,
		atRateAndValue: /^buy\s(ltc|btc)\s?@\s?([0-9]+\.?[0-9]*)\s?=\s?([0-9]+\.?[0-9]*)$/
	};
	var matches = null, type = null;
	// apply each regex till we have a match
	for (type in regex) {
		var re = regex[type];
		matches = line.match(re);
		if (matches && matches.length > 0) {
			break;
		}
	}
	if (!matches) {
		console.log('Incorrect buy format.');
		rl.prompt();
		return;
	}
	// switch on type of command to configure variables and make appropriate requests
	var asset = matches[1], value, rate;
	switch(type) {
		case 'allIn':
			trade('buy', asset);
			break;
		case 'quantity':
			trade('buy', matches[2], undefined, undefined, Number(matches[1]));
			break;
		case 'quantityRate':
			trade('buy', matches[2], Number(matches[3]), undefined, Number(matches[1]));
			break;
		case 'atValue':
			value = Number(matches[2]);
			trade('buy', asset, undefined, value);
			break;
		case 'atRate':
			rate = Number(matches[2]);
			trade('buy', asset, rate);
			break;
		case 'atRateAndValue':
			rate = Number(matches[2]);
			value = Number(matches[3]);
			trade('buy', asset, rate, value);
			break;
		default:
			// unknown order
			console.log('Invalid order format.');
			return rl.prompt();
	}
}
function sell(line) {
	var regex = {
		allOut: /^sell\s(ltc|btc)$/,
		quantity: /^sell\s([0-9]+\.?[0-9]*)\s(ltc|btc)$/,
		quantityRate: /^sell\s([0-9]+\.?[0-9]*)\s(ltc|btc)\s?\@\s?([0-9]+\.?[0-9]*)$/,
		atValue: /^sell\s(ltc|btc)\s?\=\s?([0-9]+\.?[0-9]*)$/,
		atRate: /^sell\s(ltc|btc)\s?\@\s?([0-9]+\.?[0-9]*)$/,
		atRateAndValue: /^sell\s(ltc|btc)\s?@\s?([0-9]+\.?[0-9]*)\s?=\s?([0-9]+\.?[0-9]*)$/
	};
	var matches = null, type = null;
	// apply each regex till we have a match
	for (type in regex) {
		var re = regex[type];
		matches = line.match(re);
		if (matches && matches.length > 0) {
			break;
		}
	}
	if (!matches) {
		console.log('Incorrect sell format.');
		rl.prompt();
		return;
	}
	// switch on type of command to configure variables and make appropriate requests
	var asset = matches[1], value, rate;
	switch(type) {
		case 'allOut':
			trade('sell', asset);
			break;
		case 'quantity':
			trade('sell', matches[2], null, null, Number(matches[1]));
			break;
		case 'quantityRate':
			trade('sell', matches[2], Number(matches[3]), undefined, Number(matches[1]));
			break;
		case 'atValue':
			value = matches[2];
			trade('sell', asset, null, value);
			break;
		case 'atRate':
			rate = matches[2];
			trade('sell', asset, rate);
			break;
		case 'atRateAndValue':
			rate = matches[2];
			value = matches[3];
			trade('sell', asset, rate, value);
			break;
		default:
			// unknown order
			console.log('Invalid order format.');
			return rl.prompt();
	}
}
rl.on('line', function(line) {
	// get first word in line
	line = line.trim();
	var parts = line.split(' ');
	if (parts.length <= 0) {
		return rl.prompt();
	}

	var cmd = parts[0];
	switch(cmd) {
		case 'status':
			getFunds(function(err) {
				rl.prompt();
			});
			break;
		case 'orders':
			btce.activeOrders(['ltc_usd','btc_usd','ltc_btc'], function(err, data) {
				if (data.success===0) {
					console.log('No orders.');
				} else {
					console.log('Current orders:');
					var table = new Table({
						head: ['Id', 'Type', 'Pair', 'Amount', 'Rate', 'Value'],
						colWidths: [10, 6, 10, 10, 10, 10]
					});
					for (var id in data.return) {
						var order = data.return[id];
						table.push([id, order.type.toUpperCase(), order.pair, order.amount, order.rate, order.amount*order.rate]);
					}
					console.log(table.toString());
				}
				rl.prompt();
			});
			break;
		case 'cancel':
			btce.cancelOrder(parts[1], function(err, data) {
				if (data.success) {
					console.log('Order ' + parts[1] + ' cancelled');
					if (data.return && data.return.funds) {
						var value = data.return.funds['usd'];
						var ltc = data.return.funds['ltc'],
							btc = data.return.funds['btc'];
						var table = new Table();
						table.push({"USD": value}, {"LTC": ltc}, {"BTC": btc});
						console.log(table.toString());
					}
				} else {
					console.log('Incorrect order id');
				}
				rl.prompt();
			});
			break;
		case 'clear':
			btce.activeOrders(['ltc_usd','btc_usd','ltc_btc'], function(err, data) {
				if (data.success===0) {
					console.log('No orders.');
					rl.prompt();
				} else {
					var ids = [];
					for (var id in data.return) {
						ids.push(id);
					}
					var funds = null;
					async.each(ids, function(id, callback) {
						btce.cancelOrder(id, function(err, data) {
							if (data.success) {
								console.log('Order ' + id + ' cancelled');
							} else {
								console.log('Incorrect order id');
							}
							callback();
						});
					}, function(err) {
						getFunds(function(err) {
							rl.prompt();
						});
					});
				}
			});
			break;
		case 'rate':
			btce.ticker({ pair: parts[1] + '_usd' }, function(err, data) {
				if (err) {
					return callback(err);
				}
				var table = new Table({
					head: ['Asset', 'Max', 'Min', 'Avg', 'Last', 'Sell', 'Buy'],
					cols: [8,8,8,8,8,8,8]
				});
				table.push([parts[1], data.ticker.high, data.ticker.low, data.ticker.avg, data.ticker.last, data.ticker.sell, data.ticker.buy]);
				console.log(table.toString());
				rl.prompt();
			});
			break;
		case 'buy':
			buy(line);
			break;
		case 'sell':
			sell(line);
			break;
		case 'exit':
			console.log('Good luck!');
			return process.exit(0);
		default:
			console.log('Unknown cmd :' + cmd);
			rl.prompt();
	}
}).on('close', function() {
  console.log('Be lucky.');
  process.exit(0);
});
