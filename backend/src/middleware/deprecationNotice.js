// ─── Deprecation Notice ──────────────────────────────────────────────────────
//
// Roadmap item #14 (API versioning). Applied ONLY to the legacy, unversioned
// mounts (/api/auth, /api/calls, /api/detections) — never to the new /api/v1
// mounts, which are the current, non-deprecated paths.
//
// Decision made while implementing this item: rather than a hard breaking
// change (removing the old paths outright) or a redirect (which changes the
// HTTP method/semantics for non-GET requests in ways that can surprise some
// clients), this project keeps the legacy paths fully functional — same
// router, same behavior — while marking them as deprecated via standard
// HTTP headers. This gives any existing client (or anyone still testing
// against the old Postman collection) a working transition window instead
// of an instant break, while clearly signaling that /api/v1/* is the path
// to migrate to.
//
// Two headers, both from established HTTP conventions for this exact
// purpose:
//   Deprecation: true
//     Signals this specific resource/endpoint is deprecated. No date is
//     set here — no concrete sunset date has been decided for this
//     project, so this header only states the fact of deprecation, not a
//     timeline. If a real removal date is ever chosen, this is where an
//     ISO 8601 date could replace the boolean `true`.
//   Link: <successor path>; rel="successor-version"
//     Points the caller directly at the versioned replacement for the
//     exact path they just hit — not just "go look at /api/v1" in general,
//     but the precise corresponding endpoint.
const deprecationNotice = (req, res, next) => {
  res.setHeader("Deprecation", "true");

  const successorPath = req.originalUrl.replace(/^\/api\//, "/api/v1/");
  res.setHeader("Link", `<${successorPath}>; rel="successor-version"`);

  next();
};

module.exports = { deprecationNotice };