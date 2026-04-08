# Smoke test (curl)

```bash
BASE_URL="https://api.your-domain.tld"

curl -sS "$BASE_URL/health"

curl -sS -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"secret123"}'

TOKEN="$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"secret123"}' | jq -r .token)"

curl -sS "$BASE_URL/auth/me" -H "Authorization: Bearer $TOKEN"

curl -sS "$BASE_URL/auction/stats?ids=009n9,2o0vl"

curl -sS -X POST "$BASE_URL/user/buy-prices" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"itemId":"009n9","value":"12345"}'

curl -sS "$BASE_URL/user/buy-prices" -H "Authorization: Bearer $TOKEN"
```

