---
name: point-here
description: Show the person where to look or click on a web page, with a big high-contrast numbered box and an arrow, instead of describing it. Use in a Claude in Chrome session whenever the person has to read or do something on the page themselves - a sign-in, 2FA code, password, payment, a CAPTCHA, a setting only they may change, a field you must not fill, a confirmation only they may click, or text they asked you to find - and whenever you would otherwise write "click the button at the top right". Also when they ask "where is it?", "show me", or "point to it".
---

# point-here

When the person must act on the page, **point instead of describing**. A box, a number and an arrow beat "the
blue button under Settings, top right". Pointing changes nothing on the page; they still do the action themselves,
so every rule about what you may not click or type still holds.

## How

1. Pick the targets by what the person sees: the **visible text** (a button's words, a link, a heading, a field's
   placeholder or label) or a **CSS selector** when you know one. The `ref_N` ids from `find` / `read_page` are not
   visible to page scripts: use `find` to learn the element's text, then point by that text.
2. Read `point.js` from this skill's directory (once per conversation) and run it with `javascript_tool`, the whole
   file followed by one call, in a single `javascript_exec`:

   ```js
   <contents of point.js>
   pointHere([
     { text: "Sign in with Google", label: "click here" },
     { sel: "#otp", label: "then type the 6-digit code here" },
   ])
   ```

   On the same page later, `typeof pointHere === "function"` means you can send just the `pointHere([...])` call. After
   a navigation or reload, send the file again.
3. Read the result. It lists each target as found (tag, colour) or `not found`. For a miss, try other words from the
   page, or a selector; never leave a "not found" unmentioned.
4. Tell the person in one short line what the numbers mean, e.g. "Marked in your browser: 1 is the sign-in button,
   2 is where the code goes." Don't repeat the full description.

## Targets and options

- `{ text: "..." }`: case-insensitive, whitespace-normalised; an exact match beats a longer text containing it; the
  nearest clickable ancestor (link, button, label, input) is boxed. Placeholders, aria-labels and titles count.
- `{ sel: "..." }`: `document.querySelector`. Same-origin iframes are searched too; cross-origin ones can't be.
- `label`: your words on the arrow, short and imperative ("click here", "read this", "type the code here").
  Default "look here". Several targets are numbered 1, 2, 3 in the order given: use that for "this, then this".
- `pointHere([])` clears. A new call replaces the old marks. The person clears them with Esc or the × top right.

## What it does on the page

A fixed layer on top: a 5 px box with a black and white edge in whichever loud colour (magenta, yellow, cyan, lime,
orange, red, blue, violet) contrasts most with what the target sits on; a label and arrow in the same colour. Clicks
go straight through it. It follows scrolling and resizing, scrolls the first target into view, pulses three times
(not when the system asks for reduced motion), and is immune to the page's CSS. Nothing is sent anywhere.
