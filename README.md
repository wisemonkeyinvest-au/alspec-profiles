# AlumIndex: Alspec aluminium profiles

A mobile-first static web app for browsing and searching aluminium profiles from the **Alspec Industrial Catalogue (Brendale / Chevallum)**. You can browse by category, search by code or size (`50x25x3`), filter by finish, alloy, wall thickness and size, open a detail sheet for each profile, keep a shortlist (saved in localStorage) and jump to the catalogue page.

- Data: `data/profiles.json`, generated from the PDF. Values are kept as printed, and prices aren't included.
- Generate the data (the PDF isn't committed for copyright reasons; download it from alspec.com.au):
  ```
  pip install pymupdf
  python3 scripts/extract.py path/to/Alspec-Industrial-Catalogue-Brendale-Chevallum.pdf   # -> data/raw.json
  python3 scripts/build_data.py                                                         # -> data/profiles.json
  ```
- Run locally: `python3 -m http.server 8770` and open http://127.0.0.1:8770/
- Deploy: GitHub Pages via `.github/workflows/pages.yml`.

Shape icons are original generic drawings, not catalogue artwork. Always confirm specs and stock with Alspec before ordering.
