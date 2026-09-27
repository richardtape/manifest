# BrowserFrame

The app a faculty member made, shown inside the product that made it.

## Why it is a component and not a link

The whole promise is that an idea becomes a real thing at a real address. A link to somewhere else
delivers that weakly — the person leaves, loses the context, and comes back unsure which version
they just looked at. The frame keeps the two facts, the environment switcher and the app on one
screen.

**It is also the one place in the system that uses `shadow-float`.** That shadow means *this is a
different thing, behind glass* — content that Manifest did not write and is not responsible for.
Nothing else earns it.

## Anatomy

A `radius-lg` card with a `surface-sunken` chrome bar: three inert dots, then a `mono` address field
carrying a padlock in `steady`. The body is the app. Below the frame sits one caption saying what is
being shown and to whom.

## Rules

- **The address is real and complete.** Never truncate it, never prettify it. It is the thing the
  person is proudest of and the thing they will paste into an email.
- **The app inside is not styled by this system.** It has its own type and its own warmer ground —
  that visible difference is the point, because everything inside the frame is the faculty member's
  work, not Manifest's chrome.
- **Say who you are signed in as.** A preview that silently shows an instructor view is a trap:
  *"You are signed in as yourself. A student sees the same pages with their own name and only their
  own work."*
- **Empty states are honest, never mocked.** Where an environment has nothing deployed, show that,
  with the reason and one way forward. Rendering a fake app in an empty environment is a lie the
  person will find out about at the worst moment.
- **Phone width is 390pt**, captioned, because for a tool used during a seminar the phone is the
  real case and the desktop is the convenience.

## Implementation note

This preview draws the app as markup. In production the body is an `<iframe>`, and that is not free:
the app sits behind CWL, so an embedded preview needs a session the platform currently has no way to
hand it, and a cross-origin frame of a SAML-protected app is blocked by default. Treat this
component as designed but not yet buildable end to end.
