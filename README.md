# 👷 Cloud Flare Cache Worker Device Locale Country
This worker for CloudFlare workers enables Stale-While-Revalidate caching in HTML files, so you can get fastest Time To First Byte and best user experience.

#### Usage

Clone this repo.
Edit wrangler.toml file and add account_id, zone_id and route where it will be applied.
Edit src/index.ts with your settings.
Available settings are:
```
const STALE_WHILE_REVALIDATE = 45
const MAX_AGE = 300
const STALE_IF_ERROR = 3600
const BYPASS_COOKIES = ['no_worker_cache=true', 'Authorization']
const BYPASS_PATH = ['/_nuxt/']
const BYPASS_QUERY = ['no_cache=true']
const CACHE_ON_STATUS = [200, 301, 302, 303, 307, 404]
const TRACKING_QUERY = new RegExp(
  '(gclid|utm_(source|campaign|medium)|fb(cl)?id|fbclid)',
)

const ADD_DEVICE_TO_CACHE_KEY = true
const ADD_LOCALE_TO_CACHE_KEY = true
const ADD_COUNTRY_TO_CACHE_KEY = true
const FLUSH_ALL_CACHE_QUERY = '__purge_cache'
```

then

```
npm run build && wrangler publish
```

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler).
