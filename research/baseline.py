"""Baseline backtest XAUUSD D1 (Eightcap demo export). Run: python research/baseline.py
Signals use bar-t close, fills at bar t+1 open (no look-ahead). Prices are Bid; Ask = Bid + spread.
"""
import sys
import numpy as np, pandas as pd

CSV = sys.argv[1] if len(sys.argv) > 1 else 'data/XAUUSD_D1.csv'
POINT, CONTRACT = 0.01, 100
SWAP_LONG_PTS, SWAP_SHORT_PTS = -77.91, 22.16          # per lot per night (Eightcap, 19 Oct 2026)
CAPITAL, RISK = 10_000, 0.01                             # fixed $100 risk per trade, no compounding
SLIP = 0.05                                              # $/oz extra per round trip, guess

def swap_mult(d):  # rollover after Wednesday's close is charged 3x
    return 3 if d.weekday() == 2 else 1

def load(path):
    df = pd.read_csv(path, sep='\t')
    df.columns = [c.strip('<>').lower() for c in df.columns]
    df.index = pd.to_datetime(df['date'], format='%Y.%m.%d')
    df['spr'] = df['spread'] * POINT
    hl, hc, lc = df.high - df.low, (df.high - df.close.shift()).abs(), (df.low - df.close.shift()).abs()
    df['atr'] = pd.concat([hl, hc, lc], axis=1).max(axis=1).ewm(alpha=1 / 20, adjust=False).mean()  # Wilder ATR(20)
    return df

def signals_trend(df):
    c = df.close
    s200, s50, r63, r252 = c.rolling(200).mean(), c.rolling(50).mean(), c.pct_change(63), c.pct_change(252)
    return dict(le=(c > s200) & (r63 > 0) & (r252 > 0), lx=(c < s50) | (r63 < 0),
                se=(c < s200) & (r63 < 0) & (r252 < 0), sx=(c > s50) | (r63 > 0), k=3.0, trail=True)

def signals_donchian(df):
    c = df.close
    hi55, lo55 = df.high.rolling(55).max().shift(), df.low.rolling(55).min().shift()
    hi20, lo20 = df.high.rolling(20).max().shift(), df.low.rolling(20).min().shift()
    return dict(le=c > hi55, lx=c < lo20, se=c < lo55, sx=c > hi20, k=2.0, trail=False)

def signals_random(df, p, rng, base):
    d = base(df)  # same exits/stop as the strategy under test, random entries
    u, side = rng.random(len(df)), rng.random(len(df)) < 0.5
    ok = df.close.rolling(55).count().eq(55).values
    d['le'] = pd.Series((u < p) & side & ok, df.index)
    d['se'] = pd.Series((u < p) & ~side & ok, df.index)
    return d

def run(df, s, swap_x=1.0, spr_x=1.0):
    o, h, l, c, atr = df.open.values, df.high.values, df.low.values, df.close.values, df.atr.values
    spr = df.spr.values * spr_x + SLIP
    le, lx, se, sx = (np.asarray(s[x].fillna(False), bool) for x in ('le', 'lx', 'se', 'sx'))
    # ponytail: today's swap converted to % of price per night and applied to all history;
    # real swap tracked USD rates (near zero 2020-21), so early years are over-charged. Upgrade: historical rate series.
    ref = df.close.iloc[-1]
    sw = {1: SWAP_LONG_PTS * POINT / ref * swap_x, -1: SWAP_SHORT_PTS * POINT / ref * swap_x}  # fraction of price per night
    pos = oz = entry = stop = swp = 0.0; pend = None; trades = []; eq = []; realized = 0.0
    def close_at(px, t):
        nonlocal pos, realized
        pnl = oz * (px - entry) * pos - oz * spr[t] + swp
        trades.append((df.index[t], int(pos), pnl, swp)); realized += pnl; pos = 0
    for t in range(len(df)):
        if pend == 'exit': close_at(o[t], t)
        elif pend in (1, -1) and atr[t - 1] > 0:
            pos, entry, swp = pend, o[t], 0.0
            stop = entry - pos * s['k'] * atr[t - 1]
            oz = CAPITAL * RISK / (s['k'] * atr[t - 1])
        pend = None
        if pos > 0 and l[t] <= stop: close_at(min(o[t], stop), t)
        elif pos < 0 and h[t] >= stop: close_at(max(o[t], stop), t)
        if pos:
            if s['trail']: stop = max(stop, c[t] - s['k'] * atr[t]) if pos > 0 else min(stop, c[t] + s['k'] * atr[t])
            if (pos > 0 and lx[t]) or (pos < 0 and sx[t]): pend = 'exit'
            if t + 1 < len(df): swp += oz * c[t] * sw[pos] * swap_mult(df.index[t])
        elif t + 1 < len(df):
            pend = 1 if le[t] else -1 if se[t] else None
        eq.append(realized + (oz * (c[t] - entry) * pos + swp if pos else 0))
    if pos: close_at(c[-1], len(df) - 1)
    return pd.DataFrame(trades, columns=['date', 'side', 'pnl', 'swap']), pd.Series(eq, df.index)

def stats(tr, eq):
    if tr.empty: return dict(trades=0)
    w, ls = tr.pnl[tr.pnl > 0].sum(), -tr.pnl[tr.pnl < 0].sum()
    nav = CAPITAL + eq
    dd = (nav / nav.cummax() - 1).min()
    return dict(trades=len(tr), win=f"{(tr.pnl > 0).mean():.0%}", avgR=round(float(tr.pnl.mean()) / (CAPITAL * RISK), 2),
                PF=round(float(w / ls), 2) if ls else 'inf', net=f"{tr.pnl.sum() / CAPITAL:+.0%}",
                maxDD=f"{dd:.0%}", swap=f"{tr.swap.sum() / CAPITAL:+.1%}",
                long_R=round(float(tr.pnl[tr.side > 0].sum()) / 100, 1), short_R=round(float(tr.pnl[tr.side < 0].sum()) / 100, 1))

def buy_hold(df):
    oz = CAPITAL / df.open.iloc[0]
    rate = SWAP_LONG_PTS * POINT / df.close.iloc[-1]
    sw = (oz * df.close * rate * pd.Series([swap_mult(d) for d in df.index], df.index)).cumsum().shift(fill_value=0)
    eq = oz * (df.close - df.open.iloc[0])
    nav = CAPITAL + eq + sw
    return dict(net=f"{nav.iloc[-1] / CAPITAL - 1:+.0%}", price_only=f"{eq.iloc[-1] / CAPITAL:+.0%}",
                swap=f"{sw.iloc[-1] / CAPITAL:+.0%}", maxDD=f"{(nav / nav.cummax() - 1).min():.0%}")

def by_period(tr):
    y = tr.groupby(tr.date.dt.year).pnl.sum() / 100
    return ' '.join(f"{k}:{v:+.1f}R" for k, v in y.items())

if __name__ == '__main__':
    assert sum(swap_mult(d) for d in pd.bdate_range('2026-10-19', '2026-10-22')) == 6  # Mon..Thu nights = 1+1+3+1
    df = load(CSV)
    print(f"Data {df.index[0].date()} .. {df.index[-1].date()} ({len(df)} bars), median spread ${df.spr.median():.2f}")
    print('Buy&Hold (1x notional):', buy_hold(df))
    res = {}
    for name, f in [('Trend D1', signals_trend), ('Donchian 55/20', signals_donchian)]:
        for tag, kw in [('base', {}), ('stress', dict(swap_x=1.5, spr_x=2))]:
            tr, eq = run(df, f(df), **kw); res[(name, tag)] = tr
            print(f"{name:15} {tag:6}", stats(tr, eq))
        print(' ' * 16, 'by year:', by_period(res[(name, 'base')]))
    rng = np.random.default_rng(42)
    for name, f in [('Trend D1', signals_trend), ('Donchian 55/20', signals_donchian)]:
        p = len(res[(name, 'base')]) / len(df)  # ponytail: per-bar entry prob ~ trade count, not exact match
        sims = np.array([run(df, signals_random(df, p, rng, f))[0].pnl.sum() / 100 for _ in range(300)])
        r = res[(name, 'base')].pnl.sum() / 100
        print(f"{name}: {r:+.1f}R vs random-entry median {np.median(sims):+.1f}R -> beats {(sims < r).mean():.0%} of 300 random runs")
