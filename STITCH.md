# Google Stitch handoff — Claw Services

Use this file when starting or refining the Claw Services landing page inside Google Stitch.

## Public GitHub repository

Paste this into Stitch's **Public GitHub repository** field after the repo is pushed:

```txt
https://github.com/Shmeebos/claw-services
```

## DESIGN.md

Upload or paste this file into Stitch's **Paste existing DESIGN.md** field:

```txt
DESIGN.md
```

`DESIGN.md` is the primary design brief. It tells Stitch that this is the main Claw Services company homepage, not just the request desk or portal page.

## Additional instructions for Stitch

Paste this into Stitch's **Additional instructions** field:

```txt
Use the repository and DESIGN.md as the source of truth. This is the main Claw Services company landing page, not only the private client portal or request-desk product page.

Preserve the existing premium light visual direction: warm paper background, ice-blue wash, fine grid texture, heavy dark navy typography, rounded white cards, mint/teal operational accents, restrained gold details, occasional dark navy proof panels, and high text contrast.

Shift the page story from “request desk” to the broader Claw Services company: websites, landing pages, systems, automations, content/design assets, research/admin packs, artist/business operations, and recurring operator support. The portal/request desk should appear as the operating layer that organizes delivery, not the only service being sold.

Generate a full scrolling web homepage with complete sections: company-level hero, broad services overview, how Claw works, trust/proof positioning, capabilities/work examples, portal-as-operating-system preview, simple ways to work with Claw, and a final start-request CTA.

Do not embed screenshots literally. Recreate the direction as native web UI components. Avoid generic SaaS dashboards, dark neon AI styling, aggressive claw/gaming visuals, faint gray text, and template-looking agency sections.
```

## Add website field

Leave Stitch's **Add website** field blank for now unless there is a public deployed URL.

The current local preview is:

```txt
http://192.168.1.151:3001
```

That local IP is useful for you on your network, but Google Stitch may not be able to fetch it because it is not a public URL.

## Optional uploads

If Stitch allows extra files, upload:

- `public/brand/claw-services-mark.svg`
- `public/brand/claw-services-logo.svg`
- The stock images in `public/stock/`

Do not upload `.env`, `.data`, `.next`, `node_modules`, or local temp folders.

## Best workflow

1. Paste/upload `DESIGN.md`.
2. Paste the GitHub repo URL.
3. Paste the Additional instructions above.
4. Choose **Web** as the output type.
5. Ask Stitch to refine, not reinvent.
6. If Stitch generates only a portal/product screen, run a correction: “Make this the main Claw Services company homepage; keep the portal as a secondary delivery-method section.”
