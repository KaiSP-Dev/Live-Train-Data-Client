import tkinter as tk
from tkinter import ttk, messagebox
import urllib.request
import urllib.parse
import json
import threading
import re
from datetime import datetime, timedelta

class GBExplorerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("🚆 GB Railways - Detailed Schedule & Fleet Explorer")
        self.geometry("1180x820")
        self.minsize(980, 680)
        self.configure(bg="#081014")

        self.api_base = tk.StringVar(value="http://145.241.233.162:5000")
        self.status_var = tk.StringVar(value="Ready")

        # Search Form State Variables
        self.loc_var = tk.StringVar(value="VIC")
        self.toc_var = tk.StringVar(value="All")
        self.when_var = tk.StringVar(value="Now (±1h)")
        self.date_var = tk.StringVar(value="Today")

        self.prev_call_var = tk.StringVar()
        self.later_call_var = tk.StringVar()
        self.service_type_var = tk.StringVar(value="All services")
        self.sort_by_var = tk.StringVar(value="Planned")

        # STP Filter Toggles
        self.stp_wtt_var = tk.BooleanVar(value=True)
        self.stp_var_var = tk.BooleanVar(value=True)
        self.stp_stp_var = tk.BooleanVar(value=True)
        self.stp_can_var = tk.BooleanVar(value=False)

        # Direct Search Variable
        self.direct_search_var = tk.StringVar()

        self.setup_styles()
        self.build_ui()
        self.test_connection()

    def setup_styles(self):
        self.style = ttk.Style(self)
        self.style.theme_use("clam")

        self.bg_main = "#081014"
        self.bg_card = "#0f171e"
        self.bg_input = "#05090c"
        self.border_col = "#1b2834"
        self.primary = "#00bcd4"
        self.primary_active = "#26c6da"
        self.text_main = "#f1f2f6"
        self.text_muted = "#8395a7"

        self.style.configure(".", background=self.bg_main, foreground=self.text_main)
        self.style.configure("TFrame", background=self.bg_main)
        self.style.configure("Card.TFrame", background=self.bg_card, relief="flat")
        
        self.style.configure("TLabel", background=self.bg_main, foreground=self.text_main, font=("Segoe UI", 10))
        self.style.configure("Card.TLabel", background=self.bg_card, foreground=self.text_main, font=("Segoe UI", 10))
        self.style.configure("FieldHeader.TLabel", background=self.bg_card, foreground=self.text_main, font=("Segoe UI", 10, "bold"))
        self.style.configure("Muted.TLabel", background=self.bg_card, foreground=self.text_muted, font=("Segoe UI", 9))
        self.style.configure("Title.TLabel", background=self.bg_main, foreground=self.primary, font=("Segoe UI", 15, "bold"))
        
        self.style.configure("TButton", background="#1b2834", foreground=self.text_main, borderwidth=0, font=("Segoe UI", 9, "bold"), padding=5)
        self.style.map("TButton", background=[("active", "#2c3e50")])
        
        self.style.configure("Primary.TButton", background=self.primary, foreground="#000000", font=("Segoe UI", 11, "bold"), padding=6)
        self.style.map("Primary.TButton", background=[("active", self.primary_active)])

        self.style.configure("Toggle.TCheckbutton", background=self.bg_card, foreground=self.text_main, font=("Segoe UI", 9, "bold"))

        # Notebook tabs
        self.style.configure("TNotebook", background=self.bg_main, borderwidth=0)
        self.style.configure("TNotebook.Tab", background="#121d27", foreground=self.text_muted, font=("Segoe UI", 10, "bold"), padding=(15, 6))
        self.style.map("TNotebook.Tab", background=[("selected", self.bg_card)], foreground=[("selected", self.primary)])

        # Treeview styling
        self.style.configure("Treeview", 
            background=self.bg_card, 
            foreground=self.text_main, 
            fieldbackground=self.bg_card, 
            rowheight=26, 
            font=("Segoe UI", 10),
            borderwidth=0
        )
        self.style.configure("Treeview.Heading", 
            background="#17232e", 
            foreground=self.primary, 
            font=("Segoe UI", 10, "bold"), 
            borderwidth=1, 
            relief="flat"
        )
        self.style.map("Treeview", background=[("selected", "#005b66")], foreground=[("selected", "#ffffff")])

    def build_ui(self):
        # 1. Header Toolbar
        header_frame = ttk.Frame(self, padding=(15, 10, 15, 6))
        header_frame.pack(fill="x")

        ttk.Label(header_frame, text="🚆 GB Railways Detailed Explorer", style="Title.TLabel").pack(side="left")

        api_box = ttk.Frame(header_frame)
        api_box.pack(side="right")
        ttk.Label(api_box, text="API Host:").pack(side="left", padx=4)
        api_ent = tk.Entry(api_box, textvariable=self.api_base, bg=self.bg_input, fg="#ffffff", insertbackground="#fff", width=22, relief="flat", highlightthickness=1, highlightbackground=self.border_col)
        api_ent.pack(side="left", padx=4)
        ttk.Button(api_box, text="Test", command=self.test_connection).pack(side="left", padx=2)

        # 2. Main Tabbed Workspace
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=15, pady=8)

        self.tab_location = ttk.Frame(self.notebook, style="Card.TFrame", padding=15)
        self.tab_direct = ttk.Frame(self.notebook, style="Card.TFrame", padding=15)

        self.notebook.add(self.tab_location, text="  Detailed Location Search  ")
        self.notebook.add(self.tab_direct, text="  Direct Train & Fleet Lookup  ")

        self.build_detailed_search_tab()
        self.build_direct_lookup_tab()

        # 3. Status Bar Footer
        self.footer = ttk.Frame(self, padding=(15, 4))
        self.footer.pack(fill="x", side="bottom")
        ttk.Label(self.footer, textvariable=self.status_var, font=("Segoe UI", 9)).pack(side="left")

    # =========================================================================
    # TAB 1: DETAILED LOCATION SEARCH PANEL
    # =========================================================================

    def build_detailed_search_tab(self):
        # Container Card for Form
        form_card = ttk.Frame(self.tab_location, style="Card.TFrame")
        form_card.pack(fill="x", pady=(0, 10))

        # Row 1: Primary Search Controls (Location, TOC, When, Date, Search Button)
        row1 = ttk.Frame(form_card, style="Card.TFrame")
        row1.pack(fill="x", pady=(0, 6))

        # Location Field with Autocomplete
        col_loc = ttk.Frame(row1, style="Card.TFrame")
        col_loc.pack(side="left", fill="x", expand=True, padx=(0, 8))
        ttk.Label(col_loc, text="Location", style="FieldHeader.TLabel").pack(anchor="w", pady=(0, 3))
        
        self.loc_entry = tk.Entry(col_loc, textvariable=self.loc_var, bg=self.bg_input, fg="#fff", insertbackground="#fff", font=("Segoe UI", 11), relief="flat", highlightthickness=1, highlightbackground=self.border_col)
        self.loc_entry.pack(fill="x", ipady=4)
        self.loc_entry.bind("<KeyRelease>", self.on_loc_key)
        self.loc_entry.bind("<Return>", lambda e: self.execute_detailed_search())
        self.loc_entry.bind("<Down>", self.focus_loc_autocomplete)

        # TOC Combobox
        col_toc = ttk.Frame(row1, style="Card.TFrame", width=110)
        col_toc.pack(side="left", padx=6)
        ttk.Label(col_toc, text="TOC", style="FieldHeader.TLabel").pack(anchor="w", pady=(0, 3))
        self.toc_combo = ttk.Combobox(col_toc, textvariable=self.toc_var, state="readonly", width=10)
        self.toc_combo["values"] = ["All", "SE", "TL", "SN", "GN", "GX", "LNER", "VT", "XC", "EM", "NT", "TP", "AW", "GW", "SR", "CH", "SW", "CC", "LE", "LM", "LO", "XR", "ZZ"]
        self.toc_combo.pack(ipady=2)

        # When? Combobox
        col_when = ttk.Frame(row1, style="Card.TFrame", width=140)
        col_when.pack(side="left", padx=6)
        ttk.Label(col_when, text="When?", style="FieldHeader.TLabel").pack(anchor="w", pady=(0, 3))
        self.when_combo = ttk.Combobox(col_when, textvariable=self.when_var, width=13)
        self.when_combo["values"] = ["Now (±1h)", "All Day (24h)"] + [f"{h:02d}:00" for h in range(24)]
        self.when_combo.pack(ipady=2)

        # Date Combobox
        col_date = ttk.Frame(row1, style="Card.TFrame", width=130)
        col_date.pack(side="left", padx=6)
        ttk.Label(col_date, text="Date", style="FieldHeader.TLabel").pack(anchor="w", pady=(0, 3))
        self.date_combo = ttk.Combobox(col_date, textvariable=self.date_var, width=12)
        today_iso = datetime.utcnow().strftime("%Y-%m-%d")
        tomorrow_iso = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
        yesterday_iso = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
        self.date_combo["values"] = ["Today", "Tomorrow", "Yesterday", today_iso, tomorrow_iso, yesterday_iso]
        self.date_combo.pack(ipady=2)

        # Search Button
        col_btn = ttk.Frame(row1, style="Card.TFrame")
        col_btn.pack(side="left", padx=(8, 0), pady=(18, 0))
        ttk.Button(col_btn, text=" Search ", style="Primary.TButton", command=self.execute_detailed_search).pack(ipady=2)

        # Toggle Link for Detailed Filters
        self.filters_visible = True
        self.toggle_btn = tk.Label(form_card, text="Hide detailed filtering options ▴", bg=self.bg_card, fg=self.primary, font=("Segoe UI", 9, "underline"), cursor="hand2")
        self.toggle_btn.pack(anchor="e", pady=(4, 6))
        self.toggle_btn.bind("<Button-1>", lambda e: self.toggle_filter_panel())

        # Collapsible Detailed Filtering Section
        self.filter_panel = ttk.Frame(form_card, style="Card.TFrame", padding=(10, 8, 10, 8))
        self.filter_panel.pack(fill="x", pady=(2, 8))

        # Detailed Section Title
        ttk.Label(self.filter_panel, text="Filtering", style="FieldHeader.TLabel", font=("Segoe UI", 11, "bold")).grid(row=0, column=0, columnspan=4, pady=(0, 8), sticky="w")

        # Row 2 (Grid in filter_panel): Previous call, Later call, Service type, Sort by
        ttk.Label(self.filter_panel, text="Previous call at", style="Card.TLabel").grid(row=1, column=0, sticky="w", padx=4)
        ttk.Label(self.filter_panel, text="Later call at", style="Card.TLabel").grid(row=1, column=1, sticky="w", padx=4)
        ttk.Label(self.filter_panel, text="Service type", style="Card.TLabel").grid(row=1, column=2, sticky="w", padx=4)
        ttk.Label(self.filter_panel, text="Sort by", style="Card.TLabel").grid(row=1, column=3, sticky="w", padx=4)

        self.prev_entry = tk.Entry(self.filter_panel, textvariable=self.prev_call_var, bg=self.bg_input, fg="#fff", insertbackground="#fff", relief="flat", highlightthickness=1, highlightbackground=self.border_col, width=22)
        self.prev_entry.grid(row=2, column=0, sticky="ew", padx=4, pady=3, ipady=3)

        self.later_entry = tk.Entry(self.filter_panel, textvariable=self.later_call_var, bg=self.bg_input, fg="#fff", insertbackground="#fff", relief="flat", highlightthickness=1, highlightbackground=self.border_col, width=22)
        self.later_entry.grid(row=2, column=1, sticky="ew", padx=4, pady=3, ipady=3)

        self.service_type_combo = ttk.Combobox(self.filter_panel, textvariable=self.service_type_var, state="readonly", width=22)
        self.service_type_combo["values"] = [
            "All services",
            "Calls only",
            "Passenger calls",
            "Passes only",
            "Trains only",
            "Passenger services",
            "Non-passenger services",
            "Freight services"
        ]
        self.service_type_combo.grid(row=2, column=2, sticky="ew", padx=4, pady=3, ipady=2)

        self.sort_by_combo = ttk.Combobox(self.filter_panel, textvariable=self.sort_by_var, state="readonly", width=16)
        self.sort_by_combo["values"] = ["Planned"]
        self.sort_by_combo.grid(row=2, column=3, sticky="ew", padx=4, pady=3, ipady=2)

        # Row 3 (Grid in filter_panel): STP Filter Toggle Buttons
        stp_frame = ttk.Frame(self.filter_panel, style="Card.TFrame")
        stp_frame.grid(row=3, column=0, columnspan=4, sticky="w", padx=4, pady=(10, 4))

        ttk.Label(stp_frame, text="STP Types:", style="Card.TLabel", font=("Segoe UI", 9, "bold")).pack(side="left", padx=(0, 10))
        
        ttk.Checkbutton(stp_frame, text="WTT (Permanent)", variable=self.stp_wtt_var, style="Toggle.TCheckbutton").pack(side="left", padx=6)
        ttk.Checkbutton(stp_frame, text="VAR (STP Overlay)", variable=self.stp_var_var, style="Toggle.TCheckbutton").pack(side="left", padx=6)
        ttk.Checkbutton(stp_frame, text="STP (New Schedule)", variable=self.stp_stp_var, style="Toggle.TCheckbutton").pack(side="left", padx=6)
        ttk.Checkbutton(stp_frame, text="CAN (Cancelled)", variable=self.stp_can_var, style="Toggle.TCheckbutton").pack(side="left", padx=6)

        # Autocomplete floating dropdown for location entry
        self.loc_autocomplete_box = tk.Listbox(self, bg="#0b131a", fg="#ffffff", selectbackground="#00565b", selectforeground="#ffffff", font=("Segoe UI", 10), height=6, relief="flat", highlightthickness=1, highlightbackground=self.primary)
        self.loc_autocomplete_box.bind("<Double-Button-1>", self.on_select_loc_autocomplete)
        self.loc_autocomplete_box.bind("<Return>", self.on_select_loc_autocomplete)
        self.loc_autocomplete_box.bind("<Escape>", lambda e: self.loc_autocomplete_box.place_forget())

        # Table Results View
        results_container = ttk.Frame(self.tab_location, style="Card.TFrame")
        results_container.pack(fill="both", expand=True)

        self.board_title = ttk.Label(results_container, text="Location Timetable Results", style="FieldHeader.TLabel", font=("Segoe UI", 11, "bold"))
        self.board_title.pack(anchor="w", pady=(0, 6))

        tree_scroll_box = ttk.Frame(results_container, style="Card.TFrame")
        tree_scroll_box.pack(fill="both", expand=True)

        self.loc_tree = ttk.Treeview(tree_scroll_box, columns=("headcode", "arr", "dep", "route", "toc", "plat", "stp"), show="headings")
        loc_scroll = ttk.Scrollbar(tree_scroll_box, orient="vertical", command=self.loc_tree.yview)
        self.loc_tree.configure(yscrollcommand=loc_scroll.set)

        self.loc_tree.pack(side="left", fill="both", expand=True)
        loc_scroll.pack(side="right", fill="y")
        self.loc_tree.bind("<Double-Button-1>", self.on_loc_tree_double_click)

        # Define columns
        headers = [
            ("headcode", "Train", 75), 
            ("arr", "Arr", 80), 
            ("dep", "Dep", 80), 
            ("route", "Origin ➔ Destination", 420), 
            ("toc", "Operator", 160), 
            ("plat", "Plat", 60), 
            ("stp", "Type", 65)
        ]
        for cid, text_h, w in headers:
            self.loc_tree.heading(cid, text=text_h)
            self.loc_tree.column(cid, width=w, anchor="w" if cid == "route" else "center")

        self.loc_tree_item_map = {}

    def toggle_filter_panel(self):
        if self.filters_visible:
            self.filter_panel.pack_forget()
            self.toggle_btn.configure(text="Show detailed filtering options ▾")
            self.filters_visible = False
        else:
            self.filter_panel.pack(fill="x", pady=(2, 8))
            self.toggle_btn.configure(text="Hide detailed filtering options ▴")
            self.filters_visible = True

    # =========================================================================
    # TAB 2: DIRECT TRAIN & FLEET LOOKUP
    # =========================================================================

    def build_direct_lookup_tab(self):
        search_card = ttk.Frame(self.tab_direct, style="Card.TFrame", padding=10)
        search_card.pack(fill="x", pady=(0, 10))

        ttk.Label(search_card, text="Direct Train / Fleet / Unit Identifier:", style="FieldHeader.TLabel").pack(anchor="w", pady=(0, 4))
        
        box = ttk.Frame(search_card, style="Card.TFrame")
        box.pack(fill="x")
        
        ent = tk.Entry(box, textvariable=self.direct_search_var, bg=self.bg_input, fg="#fff", insertbackground="#fff", font=("Segoe UI", 11), relief="flat", highlightthickness=1, highlightbackground=self.border_col)
        ent.pack(side="left", fill="x", expand=True, ipady=4, padx=(0, 10))
        ent.bind("<Return>", lambda e: self.execute_direct_search())

        ttk.Button(box, text=" Lookup ", style="Primary.TButton", command=self.execute_direct_search).pack(side="right")

        # Hints
        hints = ttk.Frame(search_card, style="Card.TFrame")
        hints.pack(fill="x", pady=(6, 0))
        ttk.Label(hints, text="Examples:", style="Muted.TLabel").pack(side="left", padx=(0, 6))
        for q in ["3Z31 (Headcode)", "U90544 (UID)", "375 (Class Fleet)", "375901 (Unit History)"]:
            clean_q = q.split()[0]
            lbl = tk.Label(hints, text=q, bg=self.bg_input, fg=self.primary, cursor="hand2", padx=6, pady=2, font=("Segoe UI", 9))
            lbl.pack(side="left", padx=3)
            lbl.bind("<Button-1>", lambda e, val=clean_q: self.quick_direct_search(val))

        # Direct Workspace Results View
        self.direct_results_card = ttk.Frame(self.tab_direct, style="Card.TFrame")
        self.direct_results_card.pack(fill="both", expand=True)

        self.direct_title = ttk.Label(self.direct_results_card, text="Direct Lookup Results", style="FieldHeader.TLabel", font=("Segoe UI", 11, "bold"))
        self.direct_title.pack(anchor="w", pady=(0, 6))

        direct_tree_box = ttk.Frame(self.direct_results_card, style="Card.TFrame")
        direct_tree_box.pack(fill="both", expand=True)

        self.direct_tree = ttk.Treeview(direct_tree_box, columns=("c1", "c2", "c3", "c4", "c5", "c6", "c7"), show="headings")
        direct_scroll = ttk.Scrollbar(direct_tree_box, orient="vertical", command=self.direct_tree.yview)
        self.direct_tree.configure(yscrollcommand=direct_scroll.set)

        self.direct_tree.pack(side="left", fill="both", expand=True)
        direct_scroll.pack(side="right", fill="y")
        self.direct_tree.bind("<Double-Button-1>", self.on_direct_tree_double_click)

        self.direct_tree_item_map = {}

    def quick_direct_search(self, q):
        self.direct_search_var.set(q)
        self.execute_direct_search()

    # =========================================================================
    # NETWORKING & AUTOCOMPLETE
    # =========================================================================

    def api_get(self, endpoint):
        base = self.api_base.get().rstrip("/")
        url = f"{base}{endpoint}"
        req = urllib.request.Request(url, headers={"User-Agent": "GB-Explorer-Client/2.0"})
        with urllib.request.urlopen(req, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))

    def run_async(self, target, *args):
        t = threading.Thread(target=target, args=args, daemon=True)
        t.start()

    def test_connection(self):
        def _test():
            try:
                self.api_get("/api/tocs")
                self.after(0, lambda: self.status_var.set("✅ Connected to API Engine"))
            except Exception as e:
                self.after(0, lambda: self.status_var.set(f"❌ Cannot connect to API: {e}"))
        self.run_async(_test)

    def on_loc_key(self, event):
        if event.keysym in ["Up", "Down", "Return", "Escape"]:
            return
        q = self.loc_var.get().strip().upper()
        if len(q) < 1:
            self.loc_autocomplete_box.place_forget()
            return
        self.run_async(self._fetch_loc_autocomplete, q)

    def _fetch_loc_autocomplete(self, query):
        try:
            data = self.api_get(f"/api/stations/autocomplete?q={urllib.parse.quote(query)}")
            self.after(0, lambda: self._show_loc_autocomplete(data))
        except Exception:
            self.after(0, lambda: self.loc_autocomplete_box.place_forget())

    def _show_loc_autocomplete(self, matches):
        if not matches:
            self.loc_autocomplete_box.place_forget()
            return
        
        self.loc_autocomplete_box.delete(0, tk.END)
        self.loc_autocomplete_map = []
        for m in matches:
            disp = f"{m['name']:<32} [{m['crs']}]"
            self.loc_autocomplete_box.insert(tk.END, disp)
            self.loc_autocomplete_map.append(m['crs'])

        x = self.loc_entry.winfo_rootx() - self.winfo_rootx()
        y = self.loc_entry.winfo_rooty() - self.winfo_rooty() + self.loc_entry.winfo_height() + 2
        w = max(self.loc_entry.winfo_width(), 300)
        self.loc_autocomplete_box.place(x=x, y=y, width=w)
        self.loc_autocomplete_box.lift()

    def focus_loc_autocomplete(self, event):
        if self.loc_autocomplete_box.winfo_ismapped():
            self.loc_autocomplete_box.focus_set()
            self.loc_autocomplete_box.selection_set(0)

    def on_select_loc_autocomplete(self, event):
        sel = self.loc_autocomplete_box.curselection()
        if sel:
            crs = self.loc_autocomplete_map[sel[0]]
            self.loc_var.set(crs)
            self.loc_autocomplete_box.place_forget()
            self.execute_detailed_search()

    # =========================================================================
    # SEARCH EXECUTION DISPATCHERS
    # =========================================================================

    def execute_detailed_search(self):
        self.loc_autocomplete_box.place_forget()
        loc = self.loc_var.get().strip().upper()
        if not loc:
            messagebox.showwarning("Missing Location", "Please enter a station CRS, TIPLOC, or name.")
            return

        # Prepare parameters
        toc = self.toc_var.get()
        when_val = self.when_var.get()
        date_val = self.date_var.get()
        
        # Format Date parameter
        if date_val == "Today":
            date_param = datetime.utcnow().strftime("%Y-%m-%d")
        elif date_val == "Tomorrow":
            date_param = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
        elif date_val == "Yesterday":
            date_param = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
        else:
            date_param = date_val.strip()

        # Format Time & Mode parameter
        if when_val.startswith("Now"):
            mode_param = "window"
            time_param = ""
        elif when_val.startswith("All Day"):
            mode_param = "all"
            time_param = ""
        else:
            mode_param = "window"
            time_param = when_val.strip()

        # Filter categories mapping
        st_map = {
            "All services": "all",
            "Calls only": "calls",
            "Passenger calls": "passenger_calls",
            "Passes only": "passes",
            "Trains only": "trains_only",
            "Passenger services": "passenger_services",
            "Non-passenger services": "non_passenger",
            "Freight services": "freight"
        }
        service_type_param = st_map.get(self.service_type_var.get(), "all")

        # STP overlay types
        stp_list = []
        if self.stp_wtt_var.get(): stp_list.append("WTT")
        if self.stp_var_var.get(): stp_list.append("VAR")
        if self.stp_stp_var.get(): stp_list.append("STP")
        if self.stp_can_var.get(): stp_list.append("CAN")
        stp_param = ",".join(stp_list) if stp_list else "WTT,VAR,STP,CAN"

        prev_c = self.prev_call_var.get().strip()
        later_c = self.later_call_var.get().strip()

        # Build Query string
        q_dict = {
            "location": loc,
            "toc": toc,
            "date": date_param,
            "mode": mode_param,
            "service_type": service_type_param,
            "stp_types": stp_param
        }
        if time_param: q_dict["time"] = time_param
        if prev_c: q_dict["prev_call"] = prev_c
        if later_c: q_dict["later_call"] = later_c

        url = f"/api/location-schedule?{urllib.parse.urlencode(q_dict)}"
        self.status_var.set(f"Searching timetable board for {loc}...")
        self.run_async(self._load_location_board, url, loc)

    def _load_location_board(self, url, loc_code):
        try:
            data = self.api_get(url)
            self.after(0, lambda: self._render_location_board(data, loc_code))
        except Exception as e:
            self.after(0, lambda: self.status_var.set(f"❌ Error: {e}"))

    def _render_location_board(self, data, loc_code):
        loc_name = data.get("location_name", loc_code)
        services = data.get("services", [])

        self.board_title.configure(text=f"Location Timetable Board: {loc_name} ({len(services)} services matching filters)")
        self.loc_tree.delete(*self.loc_tree.get_children())
        self.loc_tree_item_map = {}

        for s in services:
            plat_str = f"Plat {s['platform']}" if s.get('platform') else ""
            route_str = f"{s['origin_name']} ➔ {s['destination_name']}"
            item_id = self.loc_tree.insert("", "end", values=(
                s['headcode'], s['arr'], s['dep'], route_str, s['toc'], plat_str, s['stp_type']
            ))
            self.loc_tree_item_map[item_id] = s['cif_uid']

        self.status_var.set(f"Loaded {len(services)} services for {loc_name}. Double-click any row to view calling points.")

    def on_loc_tree_double_click(self, event):
        sel = self.loc_tree.selection()
        if sel:
            uid = self.loc_tree_item_map.get(sel[0])
            if uid:
                self.notebook.select(self.tab_direct)
                self.direct_search_var.set(uid)
                self.execute_direct_search()

    # =========================================================================
    # DIRECT SEARCH DISPATCHER (HEADCODE, UID, FLEET, UNIT)
    # =========================================================================

    def execute_direct_search(self):
        q = self.direct_search_var.get().strip().upper()
        if not q:
            return

        self.status_var.set(f"Direct Lookup for '{q}'...")

        if re.match(r'^\d{5,6}$', q):
            self.run_async(self._load_unit_history, q)
        elif re.match(r'^\d{2,3}$', q):
            self.run_async(self._load_traction, q)
        elif re.match(r'^[A-Z]\d{5}$', q):
            self.run_async(self._load_schedule_direct, q)
        elif re.match(r'^\d[A-Z]\d{2}$', q):
            self.run_async(self._load_headcode_direct, q)
        else:
            # Switch to location search
            self.loc_var.set(q)
            self.notebook.select(self.tab_location)
            self.execute_detailed_search()

    def _load_schedule_direct(self, uid):
        try:
            data = self.api_get(f"/api/service/{urllib.parse.quote(uid)}")
            svc = data[0] if isinstance(data, list) else data
            self.after(0, lambda: self._render_schedule_view(svc))
        except Exception as e:
            self.after(0, lambda: self.status_var.set(f"❌ Error loading schedule: {e}"))

    def _load_headcode_direct(self, headcode):
        try:
            data = self.api_get(f"/api/service-lookup?headcode={urllib.parse.quote(headcode)}")
            if isinstance(data, list) and len(data) > 1:
                self.after(0, lambda: self._render_multiple_headcodes(data, headcode))
            else:
                svc = data[0] if isinstance(data, list) else data
                self.after(0, lambda: self._render_schedule_view(svc))
        except Exception as e:
            self.after(0, lambda: self.status_var.set(f"❌ Error loading headcode: {e}"))

    def _render_multiple_headcodes(self, services, headcode):
        self.direct_title.configure(text=f"Multiple Matches for Headcode '{headcode}' (Double-click to open)")
        
        self.direct_tree["columns"] = ("uid", "origin_time", "route", "toc", "stp")
        headers = [("uid", "UID", 90), ("origin_time", "Departs", 80), 
                   ("route", "Route", 420), ("toc", "Operator", 180), ("stp", "Type", 70)]

        for cid, text_h, w in headers:
            self.direct_tree.heading(cid, text=text_h)
            self.direct_tree.column(cid, width=w, anchor="w" if cid == "route" else "center")

        self.direct_tree.delete(*self.direct_tree.get_children())
        self.direct_tree_item_map = {}

        for s in services:
            route_str = f"{s['origin_name']} ➔ {s['destination_name']}"
            item_id = self.direct_tree.insert("", "end", values=(
                s['cif_uid'], s['origin_time'], route_str, s['toc'], s.get('stp_type', 'WTT')
            ))
            self.direct_tree_item_map[item_id] = ("schedule", s['cif_uid'])

        self.status_var.set(f"Found {len(services)} services matching '{headcode}'. Double-click to select.")

    def _render_schedule_view(self, s):
        title = f"Train {s['headcode']} | {s['origin_name']} to {s['destination_name']} ({s['toc']}) | UID: {s['cif_uid']}"
        self.direct_title.configure(text=title)

        self.direct_tree["columns"] = ("tiploc", "location", "plat", "arr", "dep", "pass", "activities")
        headers = [("tiploc", "TIPLOC", 90), ("location", "Calling Point", 260), 
                   ("plat", "Plat", 60), ("arr", "Arr", 80), ("dep", "Dep", 80), 
                   ("pass", "Pass", 80), ("activities", "Activities", 240)]

        for cid, text_h, w in headers:
            self.direct_tree.heading(cid, text=text_h)
            self.direct_tree.column(cid, width=w, anchor="w" if cid in ["location", "activities"] else "center")

        self.direct_tree.delete(*self.direct_tree.get_children())
        self.direct_tree_item_map = {}

        for loc in s.get("timetable_stops", []):
            acts = ", ".join(loc.get("activities_desc", []))
            item_id = self.direct_tree.insert("", "end", values=(
                loc['tiploc'], loc['location_name'], loc.get('platform') or "",
                loc.get('arrival') or "", loc.get('departure') or "", loc.get('pass_time') or "", acts
            ))
            
            raw_t = loc.get('departure') or loc.get('pass_time') or loc.get('arrival') or "08:00"
            rounded_t = self._round_time(raw_t)
            self.direct_tree_item_map[item_id] = ("location_jump", loc['tiploc'], rounded_t)

        self.status_var.set(f"Traction: {s['booked_metrics'].get('traction', 'Standard')} | Double-click station to jump to its timetable board.")

    def _round_time(self, time_str):
        clean = re.sub(r'[½¼¾HQTD\.]', '', str(time_str).strip())
        parts = clean.split(':')
        if len(parts) >= 2:
            try:
                h, m = int(parts[0]), int(parts[1])
                if '½' in str(time_str) or '¾' in str(time_str):
                    m += 1
                    if m >= 60:
                        m = 0
                        h = (h + 1) % 24
                return f"{h:02d}:{m:02d}"
            except ValueError:
                pass
        return "08:00"

    def _load_traction(self, traction):
        try:
            services = self.api_get(f"/api/services-by-traction?traction={urllib.parse.quote(traction)}")
            self.after(0, lambda: self._render_traction_services(services, traction))
        except Exception as e:
            self.after(0, lambda: self.status_var.set(f"❌ Error: {e}"))

    def _render_traction_services(self, services, traction):
        self.direct_title.configure(text=f"Fleet Services: Class {traction} ({len(services)} trains booked)")
        
        self.direct_tree["columns"] = ("headcode", "time", "route", "traction", "toc", "type")
        headers = [("headcode", "Train", 75), ("time", "Departs", 80), 
                   ("route", "Route", 380), ("traction", "Booked Traction", 180), 
                   ("toc", "Operator", 140), ("type", "Type", 60)]

        for cid, text_h, w in headers:
            self.direct_tree.heading(cid, text=text_h)
            self.direct_tree.column(cid, width=w, anchor="w" if cid in ["route", "traction"] else "center")

        self.direct_tree.delete(*self.direct_tree.get_children())
        self.direct_tree_item_map = {}

        for s in services:
            route_str = f"{s['origin_name']} ➔ {s['destination_name']}"
            item_id = self.direct_tree.insert("", "end", values=(
                s['headcode'], s['origin_time'], route_str, s['booked_traction'], s['toc'], s.get('stp_type', 'WTT')
            ))
            self.direct_tree_item_map[item_id] = ("schedule", s['cif_uid'])

        self.status_var.set(f"Found {len(services)} services booked for Class {traction}.")

    def _load_unit_history(self, unit):
        try:
            data = self.api_get(f"/api/unit-history?unit={urllib.parse.quote(unit)}")
            self.after(0, lambda: self._render_unit_history(data, unit))
        except Exception as e:
            self.after(0, lambda: self.status_var.set(f"❌ Error: {e}"))

    def _render_unit_history(self, data, unit):
        title = f"Unit Working History: #{unit} (Class {data.get('class', 'Unknown')} - {data.get('toc', 'National Rail')})"
        self.direct_title.configure(text=title)

        self.direct_tree["columns"] = ("date", "headcode", "dep", "route", "toc")
        headers = [("date", "Date", 100), ("headcode", "Train", 75), 
                   ("dep", "Departs", 80), ("route", "Diagram Route", 420), ("toc", "Operator", 160)]

        for cid, text_h, w in headers:
            self.direct_tree.heading(cid, text=text_h)
            self.direct_tree.column(cid, width=w, anchor="w" if cid == "route" else "center")

        self.direct_tree.delete(*self.direct_tree.get_children())
        self.direct_tree_item_map = {}

        for log in data.get("diagram_history", []):
            route_str = f"{log['origin']} ➔ {log['destination']}"
            item_id = self.direct_tree.insert("", "end", values=(
                log['date'], log['headcode'], log['origin_time'], route_str, log['toc']
            ))
            self.direct_tree_item_map[item_id] = ("schedule", log['cif_uid'])

        self.status_var.set(f"Unit #{unit} Lifetime Mileage: {data.get('lifetime_mileage', 0):.1f} miles.")

    def on_direct_tree_double_click(self, event):
        sel = self.direct_tree.selection()
        if not sel:
            return
        meta = self.direct_tree_item_map.get(sel[0])
        if not meta:
            return

        action_type = meta[0]
        if action_type == "schedule":
            uid = meta[1]
            self.direct_search_var.set(uid)
            self.run_async(self._load_schedule_direct, uid)
        elif action_type == "location_jump":
            tiploc = meta[1]
            jump_time = meta[2]
            self.loc_var.set(tiploc)
            self.when_var.set(jump_time)
            self.notebook.select(self.tab_location)
            self.execute_detailed_search()

if __name__ == "__main__":
    app = GBExplorerApp()
    app.mainloop()