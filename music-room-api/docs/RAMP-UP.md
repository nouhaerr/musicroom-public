# Load testing (V.7)

Measurements from October 30, 2026, on branch `feat/mandatory`. The subject asks
us to measure and justify how many users can use our services at once, and to
specify the machine used.

## Test machine

- On-premises (not cloud): a laptop.
- CPU: Intel Core i7-11800H, 8 cores / 16 threads, 2.3 GHz.
- Memory: 15.7 GB.
- Windows 11 Home, Docker Engine 29.8.0 (Docker Desktop); its Linux VM has 16
  CPUs and 7.6 GB.
- Docker runs the API (Node 22.23.3, the project's development container,
  `npm run start:dev`) and PostgreSQL 16.15. The API runs in a single Node process.
- Test tools run on the same laptop at the same time as the server, so the
  figures are a lower bound. A server running alone would perform better.

## What is measured

This report measures Music Track Vote (rooms) and Music Playlist Editor. The
subject requires two out of three services (V.2). Music Control Delegation has
since been implemented, but it was added after these measurements and is not
included in the capacity figures below.

1. **Real-time updates**: `scripts/ramp-up.ts <spectators>` creates test users
   who all open the same public room in real time, like the room page in the app.
   It then sends 10 votes, one per second. The script measures the time from a
   vote being sent until each spectator receives it. Playlists use the same
   real-time code (same gateway, same snapshots grouped every 200 ms), so the
   measurement applies to both.
2. **Page loading**: `scripts/ramp-up.ts http` prepares 20 public rooms and 20
   public playlists (one full page in the app) and prints four `ab` (Apache
   Bench) commands ready to paste. They represent the requests sent by the app
   when opening Discover, a room, the Playlists tab, and a playlist. Each
   command sends 2,000 requests, with `-c` requests at a time.

Each run deletes its test data when finished, including on Ctrl+C.

## What counts as a good result

A result is **good** if 95% of responses arrive in less than **1 second**
(p95 < 1 s) and fewer than 1% of updates or requests fail. One second is the
point beyond which users lose track of what they are doing
([Nielsen, *Response Times: The 3 Important Limits*](https://www.nngroup.com/articles/response-times-3-important-limits/)).

The stated capacity is the largest measurement that still meets this target.

## Results: real time

One room, 10 votes. “In batches of 100” means 100 people open the room at once,
then the next 100 start after those have connected. “Connection” is the time for
all spectators to connect and subscribe to the room.

| Spectators | Arrival pattern | Connection | Failures | Missed updates | Median | p95 | Max | Good |
|---|---|---|---|---|---|---|---|---|
| 500 | batches of 100 | 2.6 s | 0 | 0% | 40 ms | 70 ms | 91 ms | ✅ |
| 1,000 | batches of 100 | 5.2 s | 0 | 0% | 54 ms | 82 ms | 99 ms | ✅ |
| 2,000 | batches of 100 | 10.6 s | 0 | 0% | 79 ms | 125 ms | 140 ms | ✅ |
| 5,000 | batches of 100 | 40.6 s | 0 | 0% | 178 ms | 295 ms | 344 ms | ✅ |
| 500 | all at once | 2.9 s | 0 | 0% | 40 ms | 62 ms | 74 ms | ✅ |
| 1,000 | all at once | 5.9 s | 0 | 0% | 57 ms | 91 ms | 117 ms | ✅ |
| 2,000 | all at once | 11.9 s | 0 | 0% | 101 ms | 414 ms | 473 ms | ✅ |
| 3,000 | all at once | 18.9 s | 2,776 | 92.5% | — | — | — | ❌ |

With 3,000 simultaneous arrivals, 2,776 spectators did not receive a server
response within the 10 seconds the app waits (`ACK_TIMEOUT_MS`).

**Capacity:** 5,000 spectators in one room when they arrive in batches of 100
(not tested beyond that); 2,000 if everyone opens the room at the same second.

## Results: page loading

2,000 requests per case; all succeeded (0 failures, no response other than 2xx).
Each case shows p95 and throughput. `-c` is the number of requests running at
the same time, not the number of users (see the next section).

| Page (request) | `-c 10` | `-c 50` | `-c 100` | `-c 200` |
|---|---|---|---|---|
| Discover (`GET /parties?page=1&limit=20&visibility=PUBLIC`) | 61 ms, 215 req/s | 383 ms, 144 req/s | 790 ms, 138 req/s | 1,548 ms ❌, 136 req/s |
| A room (`GET /parties/:id/votes/mine?page=1&limit=100`) | 50 ms, 252 req/s | 210 ms, 277 req/s | 435 ms, 261 req/s | 848 ms, 259 req/s |
| Playlists tab (`GET /playlists?page=1&limit=20&visibility=PUBLIC`) | 76 ms, 166 req/s | 312 ms, 181 req/s | 633 ms, 178 req/s | 1,314 ms ❌, 166 req/s |
| A playlist (`GET /playlists/:id`) | 43 ms, 284 req/s | 191 ms, 287 req/s | 412 ms, 280 req/s | 1,065 ms ❌, 263 req/s |

**Capacity:** 100 simultaneous requests for all four pages (200 for a room).
At full speed, the server handles about 140 requests per second for the heaviest
page (Discover) and 250–290 for a room or playlist. More simultaneous requests
do not increase throughput; they wait their turn and latency rises.

## Estimated concurrent active users

Assumption: an active user opens a page about every 10 seconds, or 0.1 requests
per second.

- For the heaviest page (Discover, about 140 requests per second):
  140 × 10 = **about 1,400 active users at once**. This is a conservative
  estimate; other pages are up to twice as fast.
- For real time, one room supports 5,000 spectators (with a one-track queue; see
  limitations for a full queue).

**On this laptop: about 1,400 active users at once, and up to 5,000 people
following one room in real time.** The subject expects thousands of users from
a small server; this laptop is in the same order of magnitude.

## Known limitations

- **Full queue.** Real-time measurements use a room with one track. A full queue
  (100 tracks, `MAX_PARTY_SONGS`) makes each update about 100 times heavier, and
  the server prepares it for every spectator. One measurement with a modified
  script that fills the queue: 500 spectators produce a p95 of 627 ms (good),
  and 1,000 produce 1,745 ms (not good). A full room therefore supports between
  500 and 1,000 spectators on this laptop.
- **Simultaneous arrivals.** Each new connection checks the account and
  permissions. The server accepts about 120–190 connections per second (5,000
  in 40.6 s; 2,000 in 11.9 s). Above 2,000 people arriving at the same second,
  some wait more than 10 seconds and the app gives up. Batches of 100 allow
  5,000 to connect.
- **Same laptop.** Test tools and server share the CPU.
- **Not tested beyond 5,000 spectators**: the script opens all connections from
  one process on the same laptop.

## Repeat the measurements

From `music-room-api`, with containers running:

```
docker compose exec backend npx ts-node scripts/ramp-up.ts 500          # 500 spectators, batches of 100
docker compose exec backend npx ts-node scripts/ramp-up.ts 2000 2000    # 2,000, all at once
```

For `ab`, raise the request limit; otherwise, requests above 60 per minute per
route receive 429:

1. In `.env`, set `THROTTLE_LIMIT=1000000`, then run
   `docker compose up -d backend` (`restart` does not reload `.env`).
2. Run `docker compose exec backend npx ts-node scripts/ramp-up.ts http`, then
   paste one of the four printed commands in another terminal, changing `-c`.
   The displayed token is valid for 15 minutes.
3. Press Ctrl+C in the first terminal; test data is deleted.
4. Restore `THROTTLE_LIMIT=60`, then run `docker compose up -d backend`.

On a less powerful machine (for example, a school computer), start small:
`ramp-up.ts 100` and `ab -c 10`.
