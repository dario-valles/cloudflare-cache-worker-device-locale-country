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
/*
  Purge cache needs POST request with query param:
  ?__purge_cache={zone_id}
  and headers:{
    'Content-Type': 'application/json',
     'Authorization': 'Bearer {Auth token from Cloudflare}',
  }
*/

addEventListener('fetch', (event: FetchEvent): Response | void => {
  try {
    const request = event.request
    const purgeCache =
      FLUSH_ALL_CACHE_QUERY &&
      new URL(request.url).search.includes(FLUSH_ALL_CACHE_QUERY) &&
      request.method.toUpperCase() === 'POST'
    if (purgeCache) {
      return event.respondWith(handlePurgeCache(request))
    }
    // bypass cache on POST requests
    if (request.method.toUpperCase() === 'POST') return
    // bypass cache on specific cookies, url paths, or query parameters
    if (checkBypassCookie(request)) return
    if (checkBypassPath(request)) return
    if (checkBypassQuery(request)) return
    return event.respondWith(handleRequest(event))
  } catch (err) {
    return new Response(err.stack || err)
  }
})

async function handleRequest(event: FetchEvent): Promise<Response> {
  try {
    const request = event.request
    const cache = caches.default
    let cacheUrl = new URL(request.url)
    // remove tracking query parameters to increase cache hit ratio
    cacheUrl = await removeCampaignQueries(cacheUrl)
    let key = cacheUrl.href
    if (ADD_DEVICE_TO_CACHE_KEY && request.headers.get('user-agent')) {
      const userAgent = request.headers.get('user-agent')
      const device = getDeviceType(userAgent)
      key += device
    }
    if (ADD_LOCALE_TO_CACHE_KEY && request.headers.get('accept-language')) {
      const locale = request.headers.get('accept-language')
      key += locale
    }
    if (ADD_COUNTRY_TO_CACHE_KEY && request.headers.get('cf-ipcountry')) {
      const country = request.headers.get('cf-ipcountry')
      key += country
    }

    const cacheRequest = new Request(key, request)

    // Get response from origin and update the cache
    const originResponse = getOrigin(event, request, cache, cacheRequest)
    // don't stop the worker before the origin request finishes and is cached
    event.waitUntil(originResponse)

    // check if url is already cached
    const response = await cache.match(cacheRequest)
    // Use cache response when available, otherwise use origin response
    if (!response) return await originResponse
    return response
  } catch (err) {
    return new Response(err.stack || err)
  }
}

function removeCampaignQueries(url: URL): URL {
  const deleteKeys = []

  for (const key of url.searchParams.keys()) {
    if (key.match(TRACKING_QUERY)) {
      deleteKeys.push(key)
    }
  }

  deleteKeys.forEach((k) => url.searchParams.delete(k))

  return url
}

async function getOrigin(
  event: FetchEvent,
  request: Request,
  cache: Cache,
  cacheRequest: Request,
): Promise<Response> {
  try {
    // Get response from origin
    let originResponse = await fetch(request)

    // use normal cloudflare cache for non html files
    if (!originResponse.headers?.get('Content-Type')?.includes('text/html'))
      return originResponse

    // must use Response constructor to inherit all of response's fields
    originResponse = new Response(originResponse.body, originResponse)

    if (CACHE_ON_STATUS.includes(originResponse.status)) {
      // Delete cookie header so HTML can be cached
      originResponse.headers.delete('Set-Cookie')
      // Overwrite Cache-Control header so HTML can be cached
      originResponse.headers.set(
        'Cache-Control',
        `max-age=${MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}, stale-if-error=${STALE_IF_ERROR}`,
      )
      // waitUntil runs even after response has been sent
      event.waitUntil(cache.put(cacheRequest, originResponse.clone()))

      return originResponse
    }
    return originResponse
  } catch (err) {
    return new Response(err.stack || err)
  }
}

function checkBypassCookie(request): boolean {
    if (!BYPASS_COOKIES.length) {
      return false
    }
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader && cookieHeader.length) {
      const cookies = cookieHeader.split(';')
      for (const cookie of cookies) {
        for (const bypassCookie of BYPASS_COOKIES) {
          if (cookie.trim().startsWith(bypassCookie)) {
            return true
          }
        }
      }
    }
    return false
}

function checkBypassPath(request): boolean {
    if (BYPASS_PATH.length) {
      const url = new URL(request.url)
      for (const uri of BYPASS_PATH) {
        if (url.pathname.includes(uri)) {
          return true
        }
      }
    }
    return false
}

function checkBypassQuery(request): boolean {
    if (BYPASS_QUERY.length) {
      const url = new URL(request.url)
      for (const query of BYPASS_QUERY) {
        if (url.search.includes(query)) {
          return true
        }
      }
    }
    return false
}

function getDeviceType(ua = ''): string {
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet'
  }
  if (
    /Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
      ua,
    )
  ) {
    return 'mobile'
  }
  return 'desktop'
}

async function handlePurgeCache(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // Lets validate the zone id, and return an error if invalid
  const zoneIdValidated = new RegExp('^([a-z0-9]{32})$').test(
    url.searchParams.get('__purge_cache'),
  )

  if (!zoneIdValidated) {
    return new Response('Invalid Zone ID', {
      status: 500,
    })
  }

  const content = '{"purge_everything":true}'
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${request.headers.get('Authorization')}`,
  }
  const init = {
    method: 'POST',
    headers: headers,
    body: content,
  }
  const purgeUrl = `https://api.cloudflare.com/client/v4/zones/${url.searchParams.get(
    FLUSH_ALL_CACHE_QUERY,
  )}/purge_cache`

  try {
    return await fetch(purgeUrl, init)
  } catch (error) {
    return new Response(error, {
      status: 500,
    })
  }
}
