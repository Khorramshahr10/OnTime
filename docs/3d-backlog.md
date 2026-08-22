# 3D views — backlog

Deferred work on the sky dome and the qibla globe, captured after the 1.7.0
release pass. Nothing here is started.

---

## 1. Fade prayers that have already passed

**Ask:** a prayer whose time has gone should recede even when it's on the near
side of the dome. Today the only thing that dims a marker is facing away from
the viewer, so at Isha the whole day's markers still read at full strength and
compete with the one that matters.

**Notes:** `rebuildDay()` already works out `nextIndex`, so past/next/upcoming
is a state we have for free. Suggest three levels rather than two — past in the
muted colour, upcoming in the text colour, next in the accent — so the card
reads as a day in progress, matching what the sun's track already does
(spent portion grey, remaining portion accent).

**Size:** small, under an hour. Worth doing first; it's the cheapest of these
and the most useful.

---

## 2. "Make the globe not cut in half"

**Needs clarification before starting.** Two readings, and they want opposite
fixes:

- **The globe is being clipped by its card.** Framing was tightened from 1.22
  to 1.12 to make it bigger, which leaves less margin — the globe may now run
  past the rounded corners of its container. Fix: back the framing off, or let
  the card grow.
- **The sky dome reads as a cut-off sphere.** It's a hemisphere sitting on a
  horizon disc, so the flat bottom is by design — but it can look like a ball
  with its lower half missing. Fix: soften the horizon plane, or show a faint
  lower hemisphere so it reads as a whole sphere with a ground plane through it.

Ask which before touching it.

---

## 3. Day and night on the globe

**Ask:** shade the half of the earth where it's currently night.

**Notes:** the maths is already in `solarGeometry` — the sub-solar point comes
from the same declination and hour angle the dome uses. Implement as a second
sphere just above the surface carrying a soft-edged shadow, rebuilt as the day
advances.

**Design question:** in the dark themes a truly dark night side is nearly
invisible against the card, and the map disappears. A gentle 25-30% darkening
with a soft terminator reads better than real night. Decide this before
building it.

**Size:** roughly half a day.

---

## 4. Moving clouds

**Ask:** clouds drifting over the globe.

**Notes:** a third sphere at a slightly larger radius with a transparent cloud
texture, rotated slowly on its own axis — a few degrees a minute reads as
motion without being distracting. Cloud coverage maps are available in the
public domain from NASA, same source family as the current coastline data.

**Costs to weigh:** this puts a continuously animating element on a screen that
currently only animates when touched, which is a battery consideration on a
prayer app people open many times a day. It also needs a real bitmap, so it
adds download size in a way the vector coastlines did not.

**Size:** half a day, plus whatever the texture weighs.

---

## 5. A photoreal map, "like Google's"

**Ask:** make the globe look like real satellite imagery.

**Achievable, with two real trade-offs to decide first:**

- **Not Google's imagery.** It's licensed and can't be bundled. The equivalent
  free option is NASA's Blue Marble, which is public domain, genuinely
  photographic, and widely used for exactly this.
- **It stops following the themes.** The map is currently drawn from vector
  coastlines and coloured from the active palette, which is why it looks right
  in all six themes. A photograph is fixed — the same blue-green earth in the
  rose, desert and forest themes. That may well be worth it, but it is a
  deliberate step away from the app's own visual language, so it's a design
  call rather than a technical one.
- **Size.** A 4K Blue Marble texture is 1-3 MB against the 171 KB the vector
  coastlines cost today. It would want lazy loading and probably a lower-res
  fallback.

**Size:** a day, most of it spent on texture sourcing, resolution trade-offs
and making it not look flat under the existing flat shading — photographic
earth usually wants real lighting to read properly, which interacts with
item 3.

**Suggested order:** 3 before 5 before 4. Day/night is cheap and makes the
globe feel real; a photographic map benefits from the lighting that day/night
introduces; clouds are the most expensive and the least informative.
