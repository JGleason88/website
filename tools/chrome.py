"""Stamp the shared header and footer into every page.

Usage: python3 tools/chrome.py
Pages opt in with marker comments:
  <!-- @header --> ... <!-- /@header -->
  <!-- @footer --> ... <!-- /@footer -->
Edit HEADER / FOOTER below, run the script, commit.
"""
import pathlib, re

CAL = "https://calendar.app.google/Dbp5daUcAbNquavv6"
ROOT = pathlib.Path(__file__).resolve().parent.parent

HEADER = f'''<!-- @header -->
<header class="site-head">
  <div class="wrap nav">
    <a class="wordmark" href="/">JOSHUA GLEASON<span>.</span></a>
    <button class="menu" id="menuBtn" aria-expanded="false" aria-controls="links">MENU</button>
    <nav class="links" id="links" aria-label="Main">
      <a href="/buy/" data-sec="buy">Buy</a>
      <a href="/sell/" data-sec="sell">Sell</a>
      <a href="/mortgages/" data-sec="mortgages">Mortgages</a>
      <a href="/intel/" data-sec="intel">Market Intel</a>
      <a href="/about/" data-sec="about">About</a>
      <a class="btn" href="{CAL}" target="_blank" rel="noopener">Book a call</a>
    </nav>
    <div class="brands" aria-label="Brokerages">
      <img src="/img/sutton.png" alt="Sutton Group Incentive Realty Inc., Brokerage" width="36" height="34">
      <img class="ybm" src="/img/ybm-white-600.png" alt="DLC Yellow Brick Mortgages" width="73" height="30">
    </div>
  </div>
</header>
<!-- /@header -->'''

FOOTER = f'''<!-- @footer -->
<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="wordmark" href="/">JOSHUA GLEASON<span>.</span></a>
        <p style="margin:14px 0 0;max-width:320px">Real estate and mortgages for Simcoe County, Muskoka and Grey, planned together.</p>
        <p style="margin:14px 0 0"><a href="tel:7057152402">705-715-2402</a><br><a href="mailto:josh@themortgageexperts.ca">josh@themortgageexperts.ca</a></p>
        <div class="foot-brands">
          <img src="/img/sutton.png" alt="Sutton Group Incentive Realty Inc., Brokerage" width="55" height="52">
          <img class="ybm" src="/img/ybm-white-600.png" alt="DLC Yellow Brick Mortgages" width="107" height="44">
        </div>
      </div>
      <div><h4>Buy &amp; sell</h4><ul><li><a href="/buy/">Buy a home</a></li><li><a href="/buy/#first-time">First-time buyers</a></li><li><a href="/buy/#power-of-sale">Power of sale list</a></li><li><a href="/sell/">Sell your home</a></li><li><a href="/sell/#value">What's my home worth?</a></li></ul></div>
      <div><h4>Mortgages</h4><ul><li><a href="/mortgages/#rates">Today's rates</a></li><li><a href="/mortgages/#purchase">Purchase calculator</a></li><li><a href="/mortgages/#refinance">Refinance calculator</a></li><li><a href="/mortgages/#all-in-one">All-in-One calculator</a></li><li><a href="/buy/#pre-approval">Get pre-approved</a></li></ul></div>
      <div><h4>More</h4><ul><li><a href="/intel/">Market Intel</a></li><li><a href="/sell/#market">Market map</a></li><li><a href="/about/">About Joshua</a></li><li><a href="{CAL}" target="_blank" rel="noopener">Book a call</a></li></ul></div>
    </div>
    <div class="legal">
      Joshua Gleason, Sales Representative, Sutton Group Incentive Realty Inc., Brokerage. Independently owned and operated.<br>
      Joshua Gleason, Mortgage Agent Level 2 (FSRA Lic. M19002343), DLC Yellow Brick Mortgages, FSRA Brokerage Lic. #13854, 18 Alliance Blvd., Unit 4, Barrie, ON L4M 5A5.<br>
      Not intended to solicit buyers or sellers currently under contract. &copy; 2026 Joshua Gleason.
    </div>
  </div>
</footer>
<!-- /@footer -->'''

CONSENT = '''<!-- @consent -->
        <label class="consent"><input type="checkbox" name="email_consent" value="Yes"> <span>Yes, email me market updates, rate news and home-buying and mortgage tips. (Optional)</span></label>
        <p class="consent-fine">Sent by Joshua Gleason, Sales Representative, Sutton Group Incentive Realty Inc., Brokerage, and Mortgage Agent Level 2, DLC Yellow Brick Mortgages (FSRA Lic. #13854), 18 Alliance Blvd., Unit 4, Barrie, ON L4M 5A5 · 705-715-2402 · joshuagleason.ca. You can withdraw your consent at any time using the unsubscribe link in any email or by contacting me.</p>
        <!-- /@consent -->'''

def stamp(text):
    text = re.sub(r'<!-- @header -->.*?<!-- /@header -->', lambda m: HEADER, text, flags=re.S)
    text = re.sub(r'<!-- @footer -->.*?<!-- /@footer -->', lambda m: FOOTER, text, flags=re.S)
    text = re.sub(r'<!-- @consent -->.*?<!-- /@consent -->', lambda m: CONSENT, text, flags=re.S)
    return text

if __name__ == '__main__':
    n = 0
    for p in ROOT.rglob('*.html'):
        if any(x in p.parts for x in ('crm', '.git', 'node_modules', 'tools')):
            continue
        t = p.read_text()
        if not any(k in t for k in ('<!-- @header -->', '<!-- @footer -->', '<!-- @consent -->')):
            continue
        new = stamp(t)
        if new != t:
            p.write_text(new); n += 1
    print(f'updated {n} page(s)')
