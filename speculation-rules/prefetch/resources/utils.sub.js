/**
 * Utilities for initiating prefetch via speculation rules.
 */

// Resolved URL to find this script.
const SR_PREFETCH_UTILS_URL = new URL(document.currentScript.src, document.baseURI);
const PREFETCH_PROXY_BYPASS_HOST = "{{hosts[alt][]}}";

class PrefetchAgent extends RemoteContext {
  constructor(uuid, t) {
    super(uuid);
    this.t = t;
  }

  getExecutorURL(options = {}) {
    let {hostname, protocol, ...extra} = options;
    let params = new URLSearchParams({uuid: this.context_id, ...extra});
    let url = new URL(`executor.sub.html?${params}`, SR_PREFETCH_UTILS_URL);
    if(hostname !== undefined) {
      url.hostname = hostname;
    }
    if(protocol !== undefined) {
      url.protocol = protocol;
      url.port = protocol === "https" ? "{{ports[https][0]}}" : "{{ports[http][0]}}";
    }
    return url;
  }

  // Requests prefetch via speculation rules.
  //
  // In the future, this should also use browser hooks to force the prefetch to
  // occur despite heuristic matching, etc., and await the completion of the
  // prefetch.
  async forceSinglePrefetch(url, extra = {}) {
    await this.execute_script((url, extra) => {
      insertSpeculationRules({ prefetch: [{source: 'list', urls: [url], ...extra}] });
    }, [url, extra]);
    return new Promise(resolve => this.t.step_timeout(resolve, 2000));
  }

  async navigate(url) {
    await this.execute_script((url) => {
      window.executor.suspend(() => {
        location.href = url;
      });
    }, [url]);
    assert_equals(
        await this.execute_script(() => location.href),
        url.toString(),
        "expected navigation to reach destination URL");
    await this.execute_script(() => {});
  }

  async getRequestHeaders() {
    return this.execute_script(() => requestHeaders);
  }
}

function getPrefetchUrlList(n) {
  let urls = [];
  for(let i=0; i<n; i++) {
    let params = new URLSearchParams({uuid: token()});
    urls.push(new URL(`prefetch.py?${params}`, SR_PREFETCH_UTILS_URL));
  }
  return urls;
}

// Must also include /common/utils.js and /common/dispatcher/dispatcher.js to use this.
async function spawnWindow(t, extra = {}) {
  let agent = new PrefetchAgent(token(), t);
  let w = window.open(agent.getExecutorURL(), extra);
  t.add_cleanup(() => w.close());
  return agent;
}

function insertSpeculationRules(body) {
  let script = document.createElement('script');
  script.type = 'speculationrules';
  script.textContent = JSON.stringify(body);
  document.head.appendChild(script);
}

async function prefetch_test(t, src_url_protocol, prefetch_url_protocol, extra_rules = {}) {
  assert_implements(HTMLScriptElement.supports('speculationrules'), "Speculation Rules not supported");

  let agent = await spawnWindow(t);
  let nextUrl = agent.getExecutorURL({ https: https_prefetch_url, page: 2 });
  await agent.forceSinglePrefetch(nextUrl, extra_rules);
  await agent.navigate(nextUrl);
  return await agent.getRequestHeaders();
}
function assert_prefetch_success(requestHeaders, description) {
  assert_in_array(requestHeaders.purpose, ["", "prefetch"], "The vendor-specific header Purpose, if present, must be 'prefetch'.");
  assert_equals(requestHeaders.sec_purpose, "prefetch", description);
}

function assert_prefetch_failure(requestHeaders, description){
  assert_equals(requestHeaders.purpose, "", description);
  assert_equals(requestHeaders.sec_purpose, "", description);
}
