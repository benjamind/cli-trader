# cli-trader - a BTCe trading tool

I've been messing around with LTC trading on BTCe, its mildly amusing. Of course I found the interface horrendous, so I put together this simple fast commandline tool for making trades.

You might need it too, if you like it and make your millions consider chucking me a few btc at `LgiQkSFU52ZffafUrsywKfnkrhNmCG4jfy`.

## Installation
```bash
npm install -g cli-trader
```

## Usage
```bash
cli-trader
```

This will then give you a prompt to configure, enter your API key and Secret for BTCe and you're good to go. It will print out your balance to confirm its all working.

### Buying

The syntax is pretty self explanatory, here's a few examples:

```
btce > buy ltc @ 33
```
Buys all the LTC you can afford at the 33 rate.

```
btce > buy ltc
```
Buys all the LTC you can afford at current sell rate.

```
btce > buy 1 ltc @ 33
```
Buys a single LTC at 33 rate.

```
btce > buy ltc @ 28 = 100
```
Buys 100$ worth of LTC at 28 rate.

Getting the picture? All trades have a confirmation to which you must enter `yes` to confirm.

### Selling

```
btce > sell ltc @ 35
```
Sells all your LTC at 35.

```
btce > sell ltc
```
Sells all the LTC you can afford at current sell rate.

```
btce > sell 1 ltc @ 33
```
Sells a single LTC at 33 rate.

```
btce > sell ltc @ 28 = 100
```
Sells 100$ worth of LTC at 28 rate.

# Other functions...
```
btce > orders
```
Lists all your outstanding orders

```
btce > cancel 30187253
```
Cancels the given order (no confirmation).

```
btce > clear
```
Clears all orders (no confirmation).

```
btce > status
```
Returns your current balance of USD, BTC and LTC.

```
btce > rate ltc
```
Lists the specified asset trade rates.

## Known issues
None as of yet, have not tested it in trading BTC, but I'm using it for LTC right now and BTC should work.

Let me know if you find any problems with it.