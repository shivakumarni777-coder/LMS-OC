"""
Builds the LMS-OC seminar deck.

The ER diagram is drawn with native PowerPoint shapes rather than being exported
as an image, so it stays crisp at any projector resolution and can be edited or
re-coloured during the presentation. Every slide carries speaker notes, because
the presenter should not have to hold the script in their head.

Screenshots come from the running demo, captured from the deployed site.
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from PIL import Image
import os

SHOTS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "seminar-assets", "shots"))
OUT = r"C:\Users\KAVI SHIVA\OneDrive\Desktop\LMS-OC-SEMINAR.pptx"

# ---------------------------------------------------------------- palette ---
INK      = RGBColor(0x16, 0x2B, 0x3D)   # headings
BODY     = RGBColor(0x3A, 0x4A, 0x5A)   # body copy
MUTED    = RGBColor(0x74, 0x84, 0x94)   # captions
ACCENT   = RGBColor(0x0F, 0x6E, 0x64)   # teal, the "lending" family
NAVY     = RGBColor(0x1B, 0x3A, 0x57)   # the "people" family
SLATE    = RGBColor(0x54, 0x6A, 0x7B)   # reference data
GOLD     = RGBColor(0xB0, 0x82, 0x1E)   # primary keys only
WHITE    = RGBColor(0xFF, 0xFF, 0xFF)
PANEL    = RGBColor(0xF2, 0xF5, 0xF7)
LINE     = RGBColor(0xCF, 0xD9, 0xE1)
BAND     = RGBColor(0xE8, 0xEF, 0xF3)

FONT = "Segoe UI"
MONO = "Consolas"

W, H = Inches(13.333), Inches(7.5)

prs = Presentation()
prs.slide_width, prs.slide_height = W, H
BLANK = prs.slide_layouts[6]


# ---------------------------------------------------------------- helpers ---
def slide():
    return prs.slides.add_slide(BLANK)


def box(s, l, t, w, h, fill=None, line=None, lw=0.75, shape=MSO_SHAPE.RECTANGLE):
    sh = s.shapes.add_shape(shape, Inches(l), Inches(t), Inches(w), Inches(h))
    sh.shadow.inherit = False
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(lw)
    sh.text_frame.text = ""
    return sh


def text(s, l, t, w, h, runs, size=14, color=BODY, bold=False, align=PP_ALIGN.LEFT,
         space_after=0, line_spacing=1.0, anchor=MSO_ANCHOR.TOP, font=FONT):
    """runs: a string, or a list of (text, size, color, bold) tuples."""
    tb = s.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = 0
    tf.margin_top = tf.margin_bottom = 0

    items = runs if isinstance(runs, list) else [(runs, size, color, bold)]
    first = True
    for item in items:
        t_ = item[0]
        sz = item[1] if len(item) > 1 and item[1] is not None else size
        col = item[2] if len(item) > 2 and item[2] is not None else color
        bd = item[3] if len(item) > 3 and item[3] is not None else bold
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        p.space_after = Pt(space_after)
        p.line_spacing = line_spacing
        r = p.add_run()
        r.text = t_
        r.font.size = Pt(sz)
        r.font.color.rgb = col
        r.font.bold = bd
        r.font.name = font
    return tb


def header(s, title, kicker=None):
    """The standard slide header: kicker, title, and a short accent rule."""
    y = 0.42
    if kicker:
        text(s, 0.7, y, 12.0, 0.26, kicker.upper(), size=10.5, color=ACCENT, bold=True)
        y += 0.30
    text(s, 0.7, y, 12.0, 0.55, title, size=27, color=INK, bold=True)
    box(s, 0.7, y + 0.62, 0.9, 0.045, fill=ACCENT)
    return y + 0.95


def footer(s, n):
    text(s, 0.7, 6.95, 8.0, 0.25, "LMS-OC  ·  Loan Management System", size=8.5, color=MUTED)
    text(s, 11.5, 6.95, 1.15, 0.25, str(n), size=8.5, color=MUTED, align=PP_ALIGN.RIGHT)


def notes(s, body):
    s.notes_slide.notes_text_frame.text = body


def picture(s, name, l, t, w, h, caption=None, cap_size=10.5):
    """Fits an image inside the box, preserving aspect ratio, centred."""
    path = os.path.join(SHOTS, name + ".png")
    with Image.open(path) as im:
        iw, ih = im.size
    ar = iw / ih
    cap_h = 0.32 if caption else 0.0
    avail_h = h - cap_h
    dw, dh = w, w / ar
    if dh > avail_h:
        dh, dw = avail_h, avail_h * ar
    dl, dt = l + (w - dw) / 2, t + (avail_h - dh) / 2
    s.shapes.add_picture(path, Inches(dl), Inches(dt), Inches(dw), Inches(dh))
    frame = box(s, dl - 0.045, dt - 0.045, dw + 0.09, dh + 0.09, fill=None, line=LINE, lw=1.0)
    frame.shadow.inherit = False
    if caption:
        text(s, l, t + avail_h + 0.06, w, cap_h, caption, size=cap_size, color=ACCENT,
             bold=True, align=PP_ALIGN.CENTER)
    return dl, dt, dw, dh


# ------------------------------------------------------------ ER diagram ---
ROW_H = 0.163
HEAD_H = 0.30

TABLES = {
    "branch": (SLATE, "branch", [
        ("branch_code", "INT", "PK"),
        ("branch_name", "VARCHAR(50)", ""),
        ("address", "VARCHAR(200)", ""),
    ]),
    "app_user": (NAVY, "app_user", [
        ("user_id", "BIGINT", "PK"),
        ("username", "VARCHAR(50)", "UQ"),
        ("password_hash", "VARCHAR(100)", ""),
        ("role", "ENUM(20)", ""),
        ("account_number", "BIGINT", "FK"),
        ("full_name", "VARCHAR(100)", ""),
        ("enabled", "BOOLEAN", ""),
        ("created_at", "TIMESTAMP", ""),
    ]),
    "customer": (NAVY, "customer", [
        ("cif_no", "INT", "PK"),
        ("account_number", "BIGINT", "FK UQ"),
        ("pan_no", "CHAR(10)", "UQ"),
        ("full_name", "VARCHAR(100)", ""),
        ("phone_no", "VARCHAR(15)", ""),
        ("dob", "DATE", ""),
        ("email", "VARCHAR(100)", "UQ"),
        ("branch_code", "INT", "FK"),
    ]),
    "loan_application": (ACCENT, "loan_application", [
        ("app_id", "INT", "PK"),
        ("cif_no", "INT", "FK"),
        ("loan_code", "INT", ""),
        ("branch_code", "INT", "FK"),
        ("requested_amount", "DECIMAL(12,2)", ""),
        ("current_status", "VARCHAR(30)", ""),
    ]),
    "loan": (ACCENT, "loan", [
        ("loan_id", "BIGINT", "PK"),
        ("loan_type", "VARCHAR(20)", ""),
        ("principal_amount", "DECIMAL(12,2)", ""),
        ("interest_rate", "DECIMAL(5,2)", ""),
        ("loan_status", "VARCHAR(20)", ""),
        ("application_date", "DATE", ""),
        ("tenure_months", "INT", ""),
        ("monthly_emi", "DECIMAL(12,2)", ""),
        ("account_number", "BIGINT", "FK"),
    ]),
    "loan_account": (ACCENT, "loan_account", [
        ("account_number", "BIGINT", "PK"),
        ("cif_number", "INT", "FK"),
        ("application_id", "INT", "FK UQ"),
        ("loan_type", "VARCHAR(50)", ""),
        ("sanctioned_amount", "DECIMAL(12,2)", ""),
        ("sanctioned_date", "DATE", ""),
        ("insurance_number", "VARCHAR(50)", ""),
        ("insurance_status", "VARCHAR(20)", ""),
        ("sanctioned_status", "BOOLEAN", ""),
        ("loan_account_status", "VARCHAR(20)", ""),
    ]),
}

PLACEMENT = {
    #        x      y
    "branch":           (0.55, 1.42),
    "app_user":         (0.55, 2.72),
    "customer":         (3.80, 1.42),
    "loan_application": (7.05, 1.42),
    "loan":             (7.05, 3.10),
    "loan_account":     (10.30, 1.42),
}
COL_W = 3.00


def draw_table(s, name):
    colour, label, cols = TABLES[name]
    x, y = PLACEMENT[name]
    h = HEAD_H + ROW_H * len(cols)
    box(s, x, y, COL_W, h, fill=WHITE, line=colour, lw=1.1)
    head = box(s, x, y, COL_W, HEAD_H, fill=colour)
    text(s, x + 0.12, y + 0.055, COL_W - 0.2, 0.22, label, size=10, color=WHITE, bold=True, font=MONO)

    for i, (col, typ, key) in enumerate(cols):
        cy = y + HEAD_H + i * ROW_H
        if i % 2 == 1:
            box(s, x + 0.01, cy, COL_W - 0.02, ROW_H, fill=PANEL)
        if key:
            box(s, x + 0.01, cy, COL_W - 0.02, 0.008, fill=colour)

        bold = "PK" in key
        ccol = GOLD if bold else (ACCENT if "FK" in key else INK)
        text(s, x + 0.12, cy + 0.017, 1.62, ROW_H, col, size=7.4, color=ccol, bold=bold, font=MONO)
        text(s, x + 1.70, cy + 0.022, 1.16, ROW_H, typ, size=6.5, color=MUTED, font=MONO)
        if key:
            text(s, x + COL_W - 0.60, cy + 0.022, 0.50, ROW_H, key, size=6.0, color=ccol, bold=True)
    return (x, y, COL_W, h)


def row_y(name, index):
    _, y = PLACEMENT[name]
    return y + HEAD_H + index * ROW_H + ROW_H / 2


def link(s, pts, colour=SLATE, dashed=False, width=1.1):
    """Orthogonal polyline, drawn as straight segments."""
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
        c.line.color.rgb = colour
        c.line.width = Pt(width)
        if dashed:
            from pptx.oxml.ns import qn
            ln = c.line._get_or_add_ln()
            d = ln.makeelement(qn('a:prstDash'), {'val': 'dash'})
            ln.append(d)
    return pts


def crow(s, x, y, label, colour=SLATE):
    text(s, x, y, 0.22, 0.20, label, size=7.5, color=colour, bold=True, align=PP_ALIGN.CENTER)


# ============================================================== 1. title ====
s = slide()
box(s, 0, 0, 13.333, 7.5, fill=INK)
box(s, 0, 0, 0.28, 7.5, fill=ACCENT)

text(s, 1.25, 2.25, 11.0, 0.35, "SEMESTER PROJECT  ·  SEMINAR", size=12, color=RGBColor(0x7E, 0xC8, 0xC0), bold=True)
text(s, 1.25, 2.72, 11.0, 0.95, "Loan Management System", size=48, color=WHITE, bold=True)
text(s, 1.25, 3.72, 11.0, 0.5, "LMS-OC  ·  a bank branch loan lifecycle, end to end",
     size=17, color=RGBColor(0xB8, 0xC6, 0xD2))

box(s, 1.25, 4.42, 1.2, 0.04, fill=ACCENT)

text(s, 1.25, 4.75, 11.0, 0.3, "Java 21  ·  Spring Boot  ·  MySQL  ·  React 19",
     size=12.5, color=RGBColor(0x8F, 0xA3, 0xB3), font=MONO)

text(s, 1.25, 6.30, 11.0, 0.3, "lmssem3.netlify.app", size=12, color=RGBColor(0x7E, 0xC8, 0xC0), bold=True)
notes(s, "Open with: \"This is a Loan Management System for a bank branch. A customer applies, an officer "
         "reviews and approves, and the system calculates the monthly instalment.\"\n\n"
         "Then stop talking and start clicking. Let the screens do the work.")

# ========================================================== 2. what it does =
s = slide()
top = header(s, "What the system does", "The problem")

rows = [
    ("Customers apply", "A customer submits a loan application - type, amount, and their account number."),
    ("Officers decide", "An administrator reviews the queue, sets a tenure, and approves or rejects."),
    ("The maths is automatic", "On approval the monthly instalment is calculated from the principal, "
                               "rate and tenure. Nobody types the number in."),
    ("Access is enforced", "A customer can only ever see their own loans. The server decides that, "
                           "not the browser."),
    ("Every step is recorded", "A loan moves PENDING -> APPROVED -> DISBURSED -> CLOSED, and each "
                               "state is stored."),
]
y = top + 0.12
for i, (h_, d) in enumerate(rows):
    box(s, 0.7, y, 0.42, 0.42, fill=ACCENT, shape=MSO_SHAPE.OVAL)
    text(s, 0.7, y + 0.10, 0.42, 0.25, str(i + 1), size=12, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    text(s, 1.32, y + 0.01, 10.6, 0.28, h_, size=14.5, color=INK, bold=True)
    text(s, 1.32, y + 0.30, 10.6, 0.42, d, size=11.5, color=BODY)
    y += 0.92

footer(s, 2)
notes(s, "Keep this to about 45 seconds. The idea to land is the fourth point: the customer/customer "
         "split is enforced by the server. That is the part worth remembering.")

# ========================================================== 3. ER diagram ===
s = slide()
top = header(s, "Entity relationship diagram", "Database blueprint")

for n in TABLES:
    draw_table(s, n)

# branch 1--N customer
yb = row_y("branch", 0)
yc = row_y("customer", 7)
link(s, [(3.55, yb), (3.80, yc)])
crow(s, 3.60, yb - 0.20, "1")
crow(s, 3.60, yc - 0.20, "N", ACCENT)

# app_user 1--0..1 customer (logical: no declared constraint)
ya = row_y("app_user", 4)
yc2 = row_y("customer", 1)
link(s, [(3.55, ya), (3.80, yc2)], dashed=True, width=1.0)
crow(s, 3.60, ya - 0.20, "1")

# customer 1--N loan
yc3 = row_y("customer", 1)
yl = row_y("loan", 8)
link(s, [(6.80, yc3), (6.93, yc3), (6.93, yl), (7.05, yl)])
crow(s, 6.86, yc3 - 0.20, "1")
crow(s, 6.86, yl - 0.20, "N", ACCENT)

# customer 1--N loan_application
yc4 = row_y("customer", 0)
yla = row_y("loan_application", 1)
link(s, [(6.80, yc4), (7.05, yla)])
crow(s, 6.86, yc4 - 0.20, "1")
crow(s, 6.86, yla - 0.20, "N", ACCENT)

# loan_application 1--1 loan_account
yla2 = row_y("loan_application", 0)
yac = row_y("loan_account", 2)
link(s, [(10.05, yla2), (10.30, yac)])
crow(s, 10.08, yla2 - 0.20, "1")
crow(s, 10.08, yac - 0.20, "1", ACCENT)

# customer 1--N loan_account.
#
# Routed down the gutter between customer and the lending tables, along a lane
# below every box, then up into loan_account's underside. A direct line from
# customer's right edge would cross the loan_application and loan_account boxes,
# and a lane at the same height as customer's own rows would cut straight
# through loan_account.
GUT = 6.92                      # centre of the 6.80..7.05 gutter
LANE = 6.30                     # below every table (lowest bottom is 4.87)
customer_bottom = PLACEMENT["customer"][1] + HEAD_H + 8 * ROW_H
loanacct_bottom = PLACEMENT["loan_account"][1] + HEAD_H + 10 * ROW_H
link(s, [(GUT, customer_bottom), (GUT, LANE), (11.80, LANE), (11.80, loanacct_bottom)], width=1.0)
crow(s, 6.80, customer_bottom + 0.10, "1")
crow(s, 11.70, loanacct_bottom + 0.10, "N", ACCENT)

# legend
box(s, 0.55, 6.42, 12.2, 0.42, fill=PANEL, line=LINE)
text(s, 0.75, 6.53, 12.0, 0.22,
     [("PK", 8, GOLD, True), ("  primary key     ", 8, MUTED, False),
      ("FK", 8, ACCENT, True), ("  foreign key     ", 8, MUTED, False),
      ("UQ", 8, NAVY, True), ("  unique     ", 8, MUTED, False),
      ("Navy", 8, NAVY, True), ("  identity     ", 8, MUTED, False),
      ("Teal", 8, ACCENT, True), ("  lending     ", 8, MUTED, False),
      ("Slate", 8, SLATE, True), ("  reference data     ", 8, MUTED, False),
      ("dashed", 8, MUTED, True), ("  logical link, not a declared constraint", 8, MUTED, False)],
     size=8)

footer(s, 3)
notes(s, "This is the blueprint. Do not read the boxes out.\n\n"
         "Say: \"Six tables. Two hold identity - app_user for login, customer for the person. "
         "One holds reference data - branch. Three hold lending - the application, the loan, and the "
         "sanctioned account.\"\n\n"
         "If asked why loan links to account_number rather than cif_no: the account number is what "
         "the customer quotes, and it is unique, so it is used as the business key. loan_account is "
         "the 1:1 result - one application produces exactly one sanctioned account.")

# ======================================================= 4. relationships ===
s = slide()
top = header(s, "The five relationships", "Reading the diagram")

rel = [
    ("branch", "customer", "1 : N", "branch_code", "A branch serves many customers."),
    ("customer", "loan", "1 : N", "account_number", "A customer holds many loans."),
    ("customer", "loan_application", "1 : N", "cif_no", "A customer applies many times."),
    ("customer", "loan_account", "1 : N", "cif_number", "Each loan becomes one account."),
    ("loan_application", "loan_account", "1 : 1", "application_id", "Unique - one application, one sanction."),
]
text(s, 0.75, top, 3.0, 0.25, "FROM", size=9, color=MUTED, bold=True)
text(s, 3.45, top, 3.0, 0.25, "TO", size=9, color=MUTED, bold=True)
text(s, 6.25, top, 1.1, 0.25, "CARD.", size=9, color=MUTED, bold=True)
text(s, 7.45, top, 1.9, 0.25, "JOIN COLUMN", size=9, color=MUTED, bold=True)
text(s, 9.45, top, 3.2, 0.25, "MEANING", size=9, color=MUTED, bold=True)
box(s, 0.75, top + 0.28, 11.9, 0.02, fill=LINE)

y = top + 0.44
for a, b, card, col, mean in rel:
    if (int((y - top) / 0.62)) % 2 == 0:
        box(s, 0.7, y - 0.06, 12.0, 0.60, fill=PANEL)
    text(s, 0.75, y + 0.05, 2.7, 0.3, a, size=11.5, color=NAVY, bold=True, font=MONO)
    text(s, 3.45, y + 0.05, 2.7, 0.3, b, size=11.5, color=ACCENT, bold=True, font=MONO)
    text(s, 6.25, y + 0.05, 1.1, 0.3, card, size=11.5, color=INK, bold=True)
    text(s, 7.45, y + 0.05, 1.9, 0.3, col, size=10, color=BODY, font=MONO)
    text(s, 9.45, y + 0.05, 3.2, 0.45, mean, size=10.5, color=BODY)
    y += 0.62

box(s, 0.75, y + 0.15, 11.9, 0.72, fill=BAND)
text(s, 1.0, y + 0.28, 11.4, 0.5,
     "Sixth, implicit link:  app_user.account_number -> customer.account_number. "
     "This one is a plain column, not a declared constraint, which is why it is dashed on the diagram.",
     size=10.5, color=BODY)

footer(s, 4)
notes(s, "Only if someone asks for the joins. The one worth knowing by heart is customer 1:N loan, "
         "because that relationship is what the role-based access control is built on.")

# ======================================================= 5. architecture ====
s = slide()
top = header(s, "How a request travels", "Architecture")

stages = [
    ("Browser", "React 19 single-page app.\nNine pages, guarded by role.", NAVY),
    ("HTTP", "GET or POST to /api/*.\nSession cookie rides along.", SLATE),
    ("Controller", "Spring Boot. Validates,\nmaps to a service call.", ACCENT),
    ("Service", "Business rules. Role scoping,\nEMI, state transitions.", ACCENT),
    ("Repository", "Spring Data JPA.\nParameterised SQL.", NAVY),
    ("MySQL", "Six tables. Foreign keys\nenforced by the database.", SLATE),
]
bw, gap = 1.86, 0.28
x = 0.75
y = top + 0.35
for i, (h_, d, col) in enumerate(stages):
    box(s, x, y, bw, 0.52, fill=col)
    text(s, x, y + 0.14, bw, 0.3, h_, size=11, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    box(s, x, y + 0.52, bw, 1.02, fill=WHITE, line=LINE)
    text(s, x + 0.11, y + 0.65, bw - 0.22, 0.85, d, size=8.6, color=BODY, align=PP_ALIGN.CENTER,
         line_spacing=1.15)
    if i < len(stages) - 1:
        text(s, x + bw - 0.02, y + 0.16, gap + 0.04, 0.3, "›", size=17, color=MUTED, bold=True,
             align=PP_ALIGN.CENTER)
    x += bw + gap

y2 = y + 1.95
box(s, 0.75, y2, 12.0, 0.85, fill=PANEL, line=LINE)
text(s, 1.0, y2 + 0.14, 11.5, 0.6,
     [("The one that matters:  ", 11.5, ACCENT, True),
      ("a customer asking for /api/loans and an administrator asking for the same URL hit the same "
       "controller. The service filters by the session's account number before anything is sent to "
       "the database. Filtering in the browser instead would mean hiding rows the customer had "
       "already been sent - which is not hiding anything.", 11.5, BODY, False)],
     size=11.5)

footer(s, 5)
notes(s, "If you only have time for one architecture point, use the box at the bottom. It is the "
         "difference between a real system and a demo that filters in the browser.")

# ==================================================== 6-15. the screenshots ==
SCREENS = [
    ("01-login", "Sign in", "Step 1  ·  Login",
     "Sign in",
     "Username and password. The server checks the password and starts a session; the browser then "
     "holds a cookie and sends it on every later request.",
     "Say: \"Login is real - the password is checked on the server, and it comes back with a session "
     "cookie.\"\n\nThe panel underneath is a demo aid. Those accounts do not exist in the real system."),
    ("02-dashboard", "Administrator dashboard", "Step 2  ·  Dashboard",
     "200 loans across four states",
     "One hundred customers, two hundred loans, five branches. Every loan sits in one of four states: "
     "pending, approved, disbursed or closed.",
     "Point at the totals. Do not read the numbers out one at a time - say \"200 loans across four "
     "states\" and move on."),
    ("03-all-loans", "Every loan on record", "Step 3  ·  All loans",
     "The full portfolio",
     "This is the administrator's view. Every customer's loan appears in this one table.",
     "Remember this screen. It becomes the contrast in a few slides."),
    ("04-approvals", "Approving an application", "Step 4  ·  Pending approvals",
     "Admin only  ·  49 awaiting a decision",
     "Only an administrator can reach this route. Choosing a pending loan, setting a tenure and "
     "approving it calculates the instalment and moves the loan to approved.",
     "This is the best 30 seconds of the demo. A real write, a state change, and the EMI appears. "
     "Type 240 for the tenure so the numbers are realistic.\n\n"
     "After approving, go back to the dashboard - the pending count drops by one."),
    ("05-customer-lookup", "Finding a customer", "Step 5  ·  Customer lookup",
     "Search by account number",
     "Find a customer by the number they quote, then see only that customer's loans.",
     "Type 304007346636. The fastest way to show one person's record if someone asks for a specific "
     "example."),
    ("07-customer-loans", "The customer's own loans", "Step 6  ·  My loans",
     "Same screen, three rows",
     "Signed out and back in as a customer. The screens are identical. The data is not: this person "
     "has three loans, not two hundred.",
     "Say: \"Exactly the same screens and the same code. He simply sees his own portfolio.\"\n\n"
     "Do not explain the mechanism yet - the next slide does it."),
    ("08-apply-loan", "Applying for a loan", "Step 7  ·  Apply for a loan",
     "Validation, then a pending application",
     "A customer submits a new application. It lands as PENDING with no instalment yet, because "
     "somebody has to approve it first.",
     "Type \"abc\" into the amount to show the validation error, then 500000 and submit. The contrast "
     "between the rejected and the accepted attempt is the whole point of the slide."),
    ("09-my-account", "The customer's own record", "Step 8  ·  My account",
     "Profile read from the data layer",
     "The signed-in customer's stored record, with amounts grouped the way an Indian bank prints "
     "them.",
     "Short slide. Show it and move on. It demonstrates the profile comes from the data layer, not "
     "from what was typed at login."),
    ("06-register", "Sign-up and KYC validation", "Step 9  ·  Register",
     "Public  ·  customer record and login in one step",
     "Registering creates the customer and their login together. PAN, phone and email are all "
     "validated before anything is written.",
     "Type an invalid PAN first to show the field errors, then a valid one. The point is that the "
     "same rules run on the server, so a bad request never reaches the database."),
]

SCREEN_NOTE_MAP = {row[0]: row[5] for row in SCREENS}

slide_no = 6
for idx, (img, title, kicker, caption, panel, note) in enumerate(SCREENS):
    s = slide()
    top = header(s, title, kicker)
    picture(s, img, 0.7, top, 8.5, 5.0, caption=caption)
    text(s, 9.6, top + 0.30, 3.05, 3.8,
         [(caption + "\n\n", 11.5, INK, True), (panel, 10.5, BODY, False)],
         size=10.5, line_spacing=1.22)
    footer(s, slide_no)
    notes(s, note)
    slide_no += 1

    # The contrast slide lands immediately after the customer's own loan list,
    # so the audience has just seen both halves of it separately.
    if img == "07-customer-loans":
        s = slide()
        top = header(s, "Same screens, different data", "Role-based access control")
        picture(s, "03-all-loans", 0.7, top, 5.9, 4.30, caption="ADMINISTRATOR  ·  200 loans")
        picture(s, "07-customer-loans", 6.9, top, 5.9, 4.30, caption="CUSTOMER  ·  3 loans")
        box(s, 0.7, top + 4.52, 12.1, 0.80, fill=BAND)
        text(s, 1.0, top + 4.66, 11.5, 0.58,
             "Identical screens, identical code, identical URL. The customer is never sent the other "
             "197 loans - the server filters by the account number in the session before it queries "
             "anything.",
             size=11, color=INK)
        footer(s, slide_no)
        notes(s, "This is the strongest slide in the deck. Pause on it.\n\n"
                 "If asked how you would prove it is not merely hidden in the browser: open the "
                 "network tab and reload. The response body genuinely contains three loans - not two "
                 "hundred with ninety-seven hidden in the page.")
        slide_no += 1

# ==================================================== 16. EMI calculation ===
s = slide()
top = header(s, "The instalment calculation", "The only formula worth memorising")

box(s, 0.7, top + 0.05, 12.1, 1.15, fill=PANEL, line=LINE)
text(s, 0.7, top + 0.40, 12.1, 0.5, "EMI  =   P × r × (1 + r)ⁿ  /  ( (1 + r)ⁿ − 1 )",
     size=27, color=ACCENT, bold=True, align=PP_ALIGN.CENTER, font=MONO)
text(s, 0.7, top + 0.92, 12.1, 0.3, "the standard reducing-balance formula",
     size=10, color=MUTED, align=PP_ALIGN.CENTER)

defs = [
    ("P", "principal", "the amount borrowed"),
    ("r", "monthly rate", "annual rate ÷ 12 ÷ 100"),
    ("n", "tenure", "in months, set at approval"),
]
y = top + 1.45
for sym, name, mean in defs:
    box(s, 0.7, y, 0.46, 0.46, fill=NAVY, shape=MSO_SHAPE.OVAL)
    text(s, 0.7, y + 0.10, 0.46, 0.28, sym, size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    text(s, 1.30, y + 0.02, 2.3, 0.3, name, size=12.5, color=INK, bold=True)
    text(s, 1.30, y + 0.26, 2.3, 0.3, mean, size=10, color=MUTED)
    y += 0.60

box(s, 4.10, top + 1.40, 8.5, 1.85, fill=WHITE, line=LINE)
text(s, 4.35, top + 1.55, 8.0, 1.6,
     [("Interest rates by product\n", 12, INK, True),
      ("Home loan        8.5%\n", 11.5, BODY, False),
      ("Education loan   9.0%\n", 11.5, BODY, False),
      ("Personal loan   12.5%", 11.5, BODY, False)],
     size=11.5, line_spacing=1.35)

text(s, 0.7, top + 3.45, 12.1, 0.5,
     "Written once, used everywhere. A test asserts the same result for a 20-year home loan, so the "
     "figure on screen is known to be right rather than plausible.",
     size=11, color=BODY)
footer(s, slide_no)
notes(s, "You do not need to derive this. Learn the three letters and the meaning of each.\n\n"
         "If someone challenges the formula: this is the standard one for a reducing-balance loan, "
         "where the outstanding principal falls each month, so the interest charged each month falls "
         "with it.")
slide_no += 1

# =========================================================== 17. testing ===
s = slide()
top = header(s, "Is it tested?", "Confidence")

stats = [
    ("23", "server tests", "login, scoping, approval, EMI", NAVY),
    ("99", "front-end tests", "adapter, validation, components", ACCENT),
    ("6", "tables", "with foreign keys enforced", SLATE),
]
x = 0.75
for num, label, sub, col in stats:
    box(s, x, top + 0.15, 3.75, 1.75, fill=WHITE, line=LINE)
    box(s, x, top + 0.15, 3.75, 0.10, fill=col)
    text(s, x, top + 0.42, 3.75, 0.75, num, size=42, color=col, bold=True, align=PP_ALIGN.CENTER)
    text(s, x, top + 1.20, 3.75, 0.3, label, size=13, color=INK, bold=True, align=PP_ALIGN.CENTER)
    text(s, x, top + 1.52, 3.75, 0.3, sub, size=9.5, color=MUTED, align=PP_ALIGN.CENTER)
    x += 3.98

text(s, 0.75, top + 2.15, 12.0, 0.3, "What the server tests actually cover", size=13, color=INK, bold=True)
cov = [
    "A correct password establishes a session, and a wrong one does not.",
    "A customer receives only their own loans - asserted row by row.",
    "Requesting another customer's loan returns 404, not 403, so it does not confirm it exists.",
    "Approving a pending loan sets the tenure and calculates the instalment.",
    "The instalment matches the expected figure for a 20-year home loan.",
]
y = top + 2.55
for c in cov:
    box(s, 0.78, y + 0.10, 0.10, 0.10, fill=ACCENT, shape=MSO_SHAPE.OVAL)
    text(s, 1.05, y, 11.7, 0.32, c, size=11, color=BODY)
    y += 0.38

footer(s, slide_no)
notes(s, "The 404-instead-of-403 test is the one worth mentioning if anyone is technical: returning "
         "403 would confirm the loan exists, which leaks information.")
slide_no += 1

# ======================================================= 18. deployment =====
s = slide()
top = header(s, "Where it runs, and what is next", "Deployment")

box(s, 0.7, top, 5.95, 3.4, fill=WHITE, line=LINE)
box(s, 0.7, top, 5.95, 0.42, fill=ACCENT)
text(s, 0.95, top + 0.10, 5.5, 0.3, "LIVE NOW", size=11, color=WHITE, bold=True)
text(s, 0.95, top + 0.62, 5.45, 0.35, "lmssem3.netlify.app", size=15, color=INK, bold=True, font=MONO)
done = [
    "Front end deployed and publicly reachable",
    "Back end written, running and tested locally",
    "MySQL schema created with foreign keys",
    "Runs with no backend at all for this demo",
]
y = top + 1.10
for d in done:
    box(s, 0.98, y + 0.06, 0.16, 0.16, fill=ACCENT, shape=MSO_SHAPE.OVAL)
    text(s, 1.28, y - 0.02, 5.2, 0.4, d, size=10.5, color=BODY)
    y += 0.44

box(s, 7.0, top, 5.65, 3.4, fill=WHITE, line=LINE)
box(s, 7.0, top, 5.65, 0.42, fill=SLATE)
text(s, 7.25, top + 0.10, 5.2, 0.3, "REMAINING", size=11, color=WHITE, bold=True)
todo = [
    "Provision the managed MySQL instance",
    "Deploy the Spring Boot service to the cloud",
    "Point the front end at the live API",
    "Turn on the session cookie's secure flag",
]
y = top + 1.10
for i, d in enumerate(todo, 1):
    box(s, 7.28, y + 0.04, 0.20, 0.20, fill=PANEL, line=MUTED, shape=MSO_SHAPE.OVAL)
    text(s, 7.28, y + 0.045, 0.20, 0.2, str(i), size=7.5, color=INK, bold=True, align=PP_ALIGN.CENTER)
    text(s, 7.60, y - 0.02, 4.9, 0.4, d, size=10.5, color=BODY)
    y += 0.44

box(s, 0.7, top + 3.65, 11.95, 1.0, fill=BAND)
text(s, 1.0, top + 3.82, 11.4, 0.7,
     "Be straightforward about this. The application is finished and tested; the cloud database has "
     "not been provisioned yet, so today it serves generated data rather than reading MySQL. That is "
     "the single remaining piece.",
     size=11, color=INK)
footer(s, slide_no)
notes(s, "Say it plainly. If you claim a live database you will be asked to prove it, and you cannot.\n\n"
         "The honest version sounds confident, not apologetic: the work is done, one piece of "
         "infrastructure is outstanding.")
slide_no += 1

# ============================================================== 19. Q&A ====
s = slide()
box(s, 0, 0, 13.333, 7.5, fill=INK)
box(s, 0, 0, 0.28, 7.5, fill=ACCENT)
text(s, 1.25, 2.6, 11.0, 0.9, "Questions", size=44, color=WHITE, bold=True)
box(s, 1.25, 3.65, 1.2, 0.04, fill=ACCENT)
text(s, 1.25, 3.95, 11.0, 0.4, "lmssem3.netlify.app", size=15, color=RGBColor(0x7E, 0xC8, 0xC0), font=MONO)
text(s, 1.25, 4.5, 11.0, 0.9,
     "If it is not something I have worked on, I would rather say so than guess.",
     size=13, color=RGBColor(0xB8, 0xC6, 0xD2), )
notes(s, "If you do not know: \"I have not worked on that part yet - I can tell you what I do know "
         "about it, or look it up after this.\"\n\nThat is a normal answer from an engineer. "
         "Bluffing is the only thing that will actually go wrong.")

prs.save(OUT)
print("saved:", OUT)
print("slides:", len(prs.slides._sldIdLst))
