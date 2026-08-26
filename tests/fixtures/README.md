# API fixtures

Real responses captured from the NHL stats API, trimmed to a couple of rows
each. They exist so the pipeline's merge → normalise → encode path can be
tested without a network call, and so an upstream field rename shows up as a
failing test rather than as a column of dashes on the live site.

To refresh one:

```bash
curl -s 'https://api.nhle.com/stats/rest/en/skater/summary?limit=2&cayenneExp=seasonId=20242025%20and%20gameTypeId=2' \
  | python3 -m json.tool > tests/fixtures/skater-summary-20242025.json
```
