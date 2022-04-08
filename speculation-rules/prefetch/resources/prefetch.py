def main(request, response):
    headers = [(b"Content-Type", b"text/plain")]
    query = {}
    for q in request.url_parts.query.split('&'):
        q = q.split('=')
        if len(q) == 1:
            query[q[0]] = None
        elif len(q) == 2:
            query[q[0]] = q[1]
        else:
            return 400, headers, "-1"

    if "uuid" not in query:
        return 400, headers, "-1"
    uuid = query["uuid"]

    prefetch = request.headers.get(
        "Sec-Purpose", b"").decode("utf-8").find("prefetch") == 0

    n = request.server.stash.take(uuid)
    if n is None:
      n = 0
    if prefetch:
      n += 1
      request.server.stash.put(uuid, n)

    return 200, headers, "{}".format(n)
