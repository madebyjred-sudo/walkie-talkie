# Kit CSS this site does not draw

The Stageshow kit was copied whole. These are its stylesheets for the parts no
scene of this site draws (toast, badge, phone, messages, chart, and the rest).
They are kept, not deleted, so a scene that starts using one of those parts has
its CSS at hand.

They live in a dot-folder on purpose: nothing here is served or bundled, and the
motion scanner skips dot-folders, so CSS the site never loads is not reported as
the site's own. `public/kit/` carries only the seven stylesheets `index.html`
links, which are the ones the scenes draw.

To use one of these: move it to `public/kit/` at the same relative path and add
its `<link>` to `sitio/index.html` and `sitio/en/index.html`, in the order
`stageshow.css` declares.
