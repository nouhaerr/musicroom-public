# The API: REST, JSON, and its documentation (V.4)

## Where to find the documentation

- **Swagger**: `http://localhost:3000/docs`, generated from the code. For each
  of the 62 routes it shows the method and path, a description, the inputs
  (body, path and query parameters, with their rules), and the output (each
  response field and its type).
- **The same contract as JSON** (OpenAPI 3.0): `http://localhost:3000/docs-json`,
  which can be imported into Postman or a client generator.
- **The documentation is type-checked**: each route declares the same return
  class that Swagger displays. If a documented field were missing from the real
  response, the type check (`npm run typecheck`, run by CI) would fail.
- **Real-time communication** (WebSocket) is not in Swagger. It is described in
  the “Real time (WebSocket)” section of the [README](../README.md).

## Why REST

The API follows REST principles:

- **Resources have their own URLs**: `/parties`, `/parties/:id`,
  `/parties/:id/queue`, `/playlists/:id/songs`, and so on.
- **HTTP methods describe the action**: `GET` reads without changing anything;
  `POST` creates or starts an action (vote, play the next track, invite);
  `PATCH` changes part of a resource; `PUT` replaces it (the profile photo);
  `DELETE` removes it. One exception is the email-verification link, which
  confirms an address with `GET` because links opened from email can only make a
  `GET` request.
- **HTTP status codes describe the result**: 201 created, 400 invalid input,
  401 unauthenticated, 403 forbidden, 404 not found, 409 rejected because of
  the current state, and 429 too many requests.
- **Stateless requests**: every request carries its token
  (`Authorization: Bearer <accessToken>`). Any server instance can respond
  without remembering the previous request.
- **Lists are paginated**: `?page=1&limit=20`, with at most 100 items per page.
- **Concurrent writes are protected**: a client sends the state it last saw
  (`expectedPlaybackVersion` when advancing to the next track,
  `expectedPosition` when moving a track). If someone changed the state in the
  meantime, the response is 409 and the app reloads the data.

Why this approach:

- It is a widely used standard: the app calls it with `fetch`, and it can be
  tested with `curl`, Swagger, or `ab` (see [RAMP-UP.md](RAMP-UP.md)).
- NestJS supports it natively, and Swagger is generated from the same classes
  used to validate input.
- Our screens need specific data: each screen corresponds to one or two routes.

Alternatives not selected:

- **GraphQL**: clients choose the fields they need through one entry point. This
  is useful when screens vary a lot, but it requires an additional schema and
  resolvers, and HTTP caching and status codes no longer apply in the same way.
  Our screens are fixed, so the benefit would be small.
- **gRPC**: binary and fast, but requires HTTP/2 and generated clients, has poor
  support in React Native / Expo, and is difficult to inspect manually.

## Real time alongside REST

REST does not notify clients; the client has to ask for updates. For rooms and
playlists, a WebSocket connection (Socket.IO) pushes updated state to everyone
watching. The rule remains simple: **all changes go through REST** (voting,
adding, moving, and so on); the connection only subscribes and receives state.
The server remains the source of truth.

## Why JSON

- **Native on both sides**: the server and app use TypeScript; `fetch` and
  `JSON.parse` can read it without a library.
- **Readable**: responses can be inspected in a terminal, Swagger, or a log.
- **Universal**: all languages and testing tools support it.
- **Simple types**: text, number, boolean, `null`, array, and object. Dates are
  sent as ISO 8601 strings (`"2026-10-30T12:00:00.000Z"`).
- All inputs and outputs use JSON, including errors
  (`{ "statusCode": 404, "message": "Party not found", "error": "Not Found" }`).
  The only exceptions are the two email links, which return an HTML page.

The trade-off is payload size: text is larger than a binary format. An update
for a room with a full queue (100 tracks) can be several dozen KB, and the server
prepares it for every listener. This is the limit described in
[RAMP-UP.md](RAMP-UP.md).

Alternatives not selected:

- **XML**: more verbose and not native in JavaScript.
- **Protobuf or MessagePack**: binary and more compact, but require an additional
  schema or library on both sides and make exchanges harder to read. JSON is
  sufficient at our scale.
