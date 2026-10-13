// Tiny in-process Prometheus-style metrics (no dependency). Per process, reset on restart.
const requests = new Map(); // "METHOD|route|status" -> { count, durationMs }
const startedAt = Date.now();

export const recordRequest = (method, route, status, durationMs) => {
  const key = `${method}|${route}|${status}`;
  const entry = requests.get(key) || { count: 0, durationMs: 0 };
  entry.count += 1;
  entry.durationMs += durationMs;
  requests.set(key, entry);
};

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const renderMetrics = (extra = {}) => {
  const lines = [
    '# HELP http_requests_total Total HTTP requests',
    '# TYPE http_requests_total counter'
  ];
  for (const [key, { count }] of requests) {
    const [method, route, status] = key.split('|');
    lines.push(`http_requests_total{method="${method}",route="${esc(route)}",status="${status}"} ${count}`);
  }
  lines.push('# HELP http_request_duration_ms_sum Total time spent handling requests', '# TYPE http_request_duration_ms_sum counter');
  for (const [key, { durationMs }] of requests) {
    const [method, route, status] = key.split('|');
    lines.push(`http_request_duration_ms_sum{method="${method}",route="${esc(route)}",status="${status}"} ${durationMs.toFixed(2)}`);
  }
  const mem = process.memoryUsage();
  lines.push(
    '# TYPE process_uptime_seconds gauge', `process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`,
    '# TYPE process_resident_memory_bytes gauge', `process_resident_memory_bytes ${mem.rss}`,
    '# TYPE nodejs_heap_used_bytes gauge', `nodejs_heap_used_bytes ${mem.heapUsed}`
  );
  for (const [name, value] of Object.entries(extra)) {
    lines.push(`# TYPE ${name} gauge`, `${name} ${value}`);
  }
  return lines.join('\n') + '\n';
};

export const resetMetrics = () => requests.clear();
