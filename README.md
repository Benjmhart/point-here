# point-here

When Claude drives your browser (Claude in Chrome) and you have to read or click something yourself, a sign-in, a
2FA code, a setting only you may change, Claude **points at it** instead of describing it. You get a big numbered box
and an arrow with Claude's words ("click here", "then type the code here"), in a colour picked to stand out against
that page.

<!-- screenshot / GIF here -->

- **Readable on any page:** a 5 px box with a black and white edge, in whichever loud colour (magenta, yellow, cyan,
  lime, orange, red, blue, violet) contrasts most with what the target sits on (WCAG contrast ratio).
- **Never in the way:** clicks go straight through the marks. Esc or the × clears them. They follow scrolling and
  resizing, and the first target is scrolled into view.
- **Several at once:** numbered 1, 2, 3 for "this, then this".
- **Robust:** no dependencies, nothing installed in the browser, nothing sent anywhere. It works under a strict
  Content Security Policy, and the page's own CSS can't move or hide it. No pulsing if your system asks for reduced
  motion.

## Install

```
/plugin marketplace add Benjmhart/point-here
/plugin install point-here@point-here
```

It needs [Claude in Chrome](https://code.claude.com/docs/en/chrome). The skill tells Claude when to point; you can
also just ask: "show me where", "point to it".

## How it works

`skills/point-here/point.js` is one self-contained script (about 150 lines). Claude runs it on the page with
`javascript_tool` and calls `pointHere([{ text: "Save changes", label: "click here" }, { sel: "#otp" }])`. Targets are
found by visible text (also placeholders and aria-labels) or by CSS selector, in same-origin iframes too. It returns
what it found, so Claude can say when something wasn't there.

## Test

```
node test/run.mjs
```

It opens the fixture pages in headless Chromium: light, dark, busy and magenta backgrounds, an iframe, a far-down
target, a page whose CSS attacks the overlay, and a strict-CSP page. It checks:
- each target is found and boxed;
- the contrast is high enough;
- clicks pass through;
- scrolling into view, Esc, replacing and clearing all work;
- the pulse runs, and stops under reduced motion.

CI runs it on every push.

## Licence

MIT
