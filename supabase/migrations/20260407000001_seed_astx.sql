insert into etf_funds (ticker, name, description, strategy, inception_date, created_by)
values (
  'ASTX',
  'ASTAR Space ETF',
  'Pure-play global space economy ETF tracking launch, satellite communications, earth observation, lunar infrastructure, and defense-adjacent space companies.',
  'Concentrated active management with 12 holdings, quarterly rebalancing, overweight high-conviction pure-play space stocks.',
  '2026-04-07',
  'erik@astarconsulting.no'
);

insert into etf_holdings (fund_id, symbol, name, domain, sector, weight)
select id, h.symbol, h.name, h.domain, h.sector, h.weight
from etf_funds, (values
  ('RKLB', 'Rocket Lab USA',      'rocketlabusa.com',      'launch',         0.1500),
  ('ASTS', 'AST SpaceMobile',     'ast-science.com',       'connectivity',   0.1200),
  ('PL',   'Planet Labs',         'planet.com',            'earth-obs',      0.1000),
  ('LUNR', 'Intuitive Machines',  'intuitivemachines.com', 'lunar',          0.1000),
  ('KTOS', 'Kratos Defense',      'kratosdefense.com',     'defense',        0.1000),
  ('IRDM', 'Iridium',            'iridium.com',           'connectivity',   0.0800),
  ('RDW',  'Redwire',            'redwirespace.com',      'manufacturing',  0.0800),
  ('SATS', 'EchoStar',           'echostar.com',          'connectivity',   0.0700),
  ('GSAT', 'Globalstar',         'globalstar.com',        'connectivity',   0.0700),
  ('VSAT', 'Viasat',             'viasat.com',            'connectivity',   0.0700),
  ('MNTS', 'Momentus',           'momentus.space',        'in-space',       0.0300),
  ('BKSY', 'BlackSky Technology','blacksky.com',          'earth-obs',      0.0300)
) as h(symbol, name, domain, sector, weight)
where etf_funds.ticker = 'ASTX';
