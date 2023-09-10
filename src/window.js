/* window.js
 *
 * Copyright 2023 Michael Hammer
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';

import { API } from './api.js';

const use_local = true;


const Soup = imports.gi.Soup;
const Decoder = new TextDecoder();
const session = Soup.Session.new();



var window;


export const QuestscribeWindow = GObject.registerClass({
  GTypeName: 'QuestscribeWindow',
  Template: 'resource:///io/github/qwertzuiopy/Questscribe/window.ui',
}, class QuestscribeWindow extends Adw.ApplicationWindow {
  constructor(application) {
    super({ application });
    this.app_content = new Gtk.Box( { orientation: Gtk.Orientation.VERTICAL } );
    this.overview = new Adw.TabOverview( { enable_new_tab: true } );
    this.overview.connect("create-tab", () => {
      let tab = new SearchTab({}, new Adw.Leaflet( { can_unfold: false } ));
      this.tab_view.append(tab.navigation_view);
      tab.navigation_view.tab_page = this.tab_view.get_nth_page(this.tab_view.n_pages-1);
      return this.tab_view.get_nth_page(this.tab_view.n_pages-1);
    } );

    this.content = this.overview;
    this.overview.child = this.app_content;

    this.tab_view = new Adw.TabView( {
      halign: Gtk.Align.FILL, valign: Gtk.Align.FILL,
      hexpand: true, vexpand: true } );
    this.tabs = [
      new SearchTab({}, new Adw.Leaflet( { can_unfold: false } )),
    ];
    this.tab_view.connect("create-window", () => {
      let new_window = new QuestscribeWindow(application);
      new_window.present();
      return new_window.tab_view;
    });

    for (let i in this.tabs) {
      this.tab_view.append(this.tabs[i].navigation_view);
      this.tabs[i].navigation_view.tab_page = this.tab_view.get_nth_page(i);
      this.tabs[i].navigation_view.tab_view = this.tab_view;
    }
    this.active_tab = 0;
    this.tab_bar = new Adw.TabBar( { view: this.tab_view } );
    this.header_bar = new Adw.HeaderBar( {
      title_widget: new Gtk.Label( {
        label: "Questscribe",
        css_classes: ["heading"] } ) } );

    this.new_tab = new Gtk.Button( { icon_name: "tab-new-symbolic" } );
    this.new_tab.connect("clicked", () => {
      let tab = new SearchTab({}, new Adw.Leaflet( { can_unfold: false } ));
      this.tab_view.append(tab.navigation_view);
      tab.navigation_view.tab_page = this.tab_view.get_nth_page(this.tab_view.n_pages-1);
      tab.navigation_view.tab_view = this.tab_view;
    } );
    this.open_overview = new Gtk.Button( { icon_name: "view-grid-symbolic" } );
    this.open_overview.connect("clicked", () => { this.overview.open = true; } );
    this.overview.view = this.tab_view;
    this.header_bar.pack_start(this.new_tab);
    this.header_bar.pack_start(this.open_overview);

    this.menu = new Gio.Menu();
    this.menu.append_item(Gio.MenuItem.new("Preferences", "app.settings"));
    this.menu.append_item(Gio.MenuItem.new("About Questscribe", "app.about"));


    this.header_bar.pack_end(new Gtk.MenuButton( { icon_name: "open-menu-symbolic", menu_model: this.menu } ));
    this.app_content.append(this.header_bar);
    this.app_content.append(this.tab_bar);
    this.app_content.append(this.tab_view);

    for (let i in filter_options) {
      filter_actions[i] = new Gio.SimpleAction({
        name: 'filter_' + i,
      });
      filter_actions[i].connect("activate", () => {
        this.tab_view.selected_page.child.visible_child.add_filter(i);
      });
      this.add_action(filter_actions[i]);
    }

    window = this;
    try {
      load_state();
    } catch {
      save_state();
    }
  }
});


function new_tab_from_data(data) {
  let tab_view = window.tab_view;
  let tab = new SearchTab({}, new Adw.Leaflet( { can_unfold: false } ));
  tab_view.append(tab.navigation_view);
  tab.navigation_view.tab_page = tab_view.get_nth_page(tab_view.n_pages-1);
  tab.navigation_view.tab_view = tab_view;
  tab_view.selected_page = tab_view.get_nth_page(tab_view.n_pages-1);
  navigate(data, tab.navigation_view);
  return tab;
}

const Tab = GObject.registerClass({
  GTypeName: 'Tab',
}, class extends Gtk.Box {
  constructor() {
    super({});
  }
});

const filter_actions = [];
const filter_options = {
  Spells: {
    title: "Spells",
    choices: [
      { title: "School", content: ["Any"].concat(get_sync("/api/magic-schools").results.map((i) => { return i.name; } )), selected: "Any" },
      { title: "Level", content: ["Any", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], selected: "Any" },
      { title: "Classes", content: ["Any"].concat(get_sync("/api/classes").results.map((i) => { return i.name; } )), selected: "Any" },
    ],
    func: (url, o) => {
      if (!url.includes("spells")) return false;
      let data = get_sync(url);
      return (o.options.choices[0].selected == "Any" || o.options.choices[0].selected == data.school.name)
          && (o.options.choices[1].selected == "Any" || o.options.choices[1].selected == data.level.toString())
          && (o.options.choices[2].selected == "Any" || data.classes.map((i) => i.name).indexOf(o.options.choices[2].selected) != -1);
    },
  },
  Items: {
    title: "Items",
    choices: [
      { title: "Categories", content: ["Any"].concat(get_sync("/api/equipment-categories").results.map((i) => { return i.name; } )), selected: "Any" },
    ],
    func: (url, o) => {
      if (!url.includes("equipment") || url.includes("categories")) return false;
      let data = get_sync(url);
      return o.options.choices[0].selected == "Any" || o.options.choices[0].selected == data.equipment_category.name;
    },
  },
  Monsters: {
    title: "Monsters",
    choices: [ { title: "School", content: ["1", "2", "3"] } ],
    func: (url, o) => { return url.includes("monsters"); },
  },
  MagicItems: {
    title: "Magic Items",
    choices: [ {
      title: "Rarity", content: ["Any", "Varies", "Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"], selected: "Any" }
    ],
    func: (url, o) => {
      if (!url.includes("magic-items")) return false;
      let data = get_sync(url);
      return o.options.choices[0].selected == "Any" || o.options.choices[0].selected == data.rarity.name;
    },
  },
  Classes: {
    title: "Classes",
    choices: [],
    func: (url, o) => { return url.includes("classes"); },
  },

};

const damage_icon_filenames = {
  acid: "acid",
  bludgeoning: "",
  cold: "",
  fire: "",
  force: "",
  lightning: "",
  necrotic: "",
  piercing: "",
  poison: "",
  psychic: "",
  radiant: "",
  slashing: "",
  thunder: "",
};

const Filter = GObject.registerClass({
  GTypeName: 'Filter',
}, class extends Adw.Bin {
  constructor(box, options) {
    super();
    this.box = box;
    this.options = options;

    this.popover = new Gtk.Box( { orientation: Gtk.Orientation.VERTICAL, spacing: 5 } );
    for (let i in this.options.choices) {
      let box = new Gtk.Box( { spacing: 5, hexpand: true } );
      box.append(new Gtk.Label( { label:this.options.choices[i].title, hexpand: true } ));
      let dropdown = Gtk.DropDown.new_from_strings(this.options.choices[i].content);
      dropdown.connect("notify::selected", (d) => { this.options.choices[i].selected = this.options.choices[i].content[d.selected]; this.box.update_search(); });
      dropdown.halign = Gtk.Align.END;
      box.append(dropdown);
      this.popover.append(box);
    }
    this.button = new Adw.SplitButton( {
      label: options.title,
      valign: Gtk.Align.CENTER, halign: Gtk.Align.CENTER,
      popover: new Gtk.Popover( { child: this.popover } ) } );
    this.child = this.button;
    this.button.connect('clicked', () => { this.box.remove_filter(this); });
  }

});



const SearchResult = GObject.registerClass({
  GTypeName: 'SearchResult',
}, class extends Adw.ActionRow {
  constructor(data, type) {
    super({});
    this.data = data;
    this.type = type;

    // for searching
    this.name = this.data.name;

    this.set_title(this.data.name);
    this.set_subtitle(this.data.url
      .split("/")[2]
      .split("-")
      .map((str) => { return str.charAt(0).toUpperCase() + str.slice(1); } )
      .join(" "));
    this.arrow = new Gtk.Image({ iconName: "go-next-symbolic" });
    this.add_suffix(this.arrow);
    this.set_activatable(true);

  }
});

const Card = GObject.registerClass({
  GTypeName: 'Card',
}, class extends Gtk.Box {
  constructor(title, content) {
    super({});

    this.orientation = Gtk.Orientation.VERTICAL;
    this.add_css_class("card");
    this.spacing = 10;
    this.vexpand = false;
    this.valign = Gtk.Align.CENTER;
    this.halign = Gtk.Align.CENTER;
    this.set_size_request(120, 0);

    this.label = new Gtk.Label();
    this.label.set_label(title); this.hexpand = true;
    this.label.margin_top = 20;
    this.label.margin_start = 15;
    this.label.margin_end = 15;
    this.append(this.label);

    this.content = new Gtk.Label();
    this.content.set_label(content);
    this.content.add_css_class("title-4");
    this.content.margin_bottom = 20;
    this.content.margin_start = 15;
    this.content.margin_end = 15;
    this.append(this.content);
  }
});

const LinkCard = GObject.registerClass({
  GTypeName: 'LinkCard',
}, class extends Gtk.Box {
  constructor(title, content, data, navigation_view) {
    super( {
      orientation: Gtk.Orientation.VERTICAL,
      css_classes: ["card"],
      spacing: 10,
      vexpand: false,
      valign: Gtk.Align.CENTER,
      halign: Gtk.Align.CENTER,
      width_request: 120 } );

    this.navigation_view = navigation_view;
    this.data = data;

    this.label = new Gtk.Label( {
      hexpand: true,
      label: title,
      margin_top: 20,
      margin_start: 20,
      margin_end: 15 } );
    this.append(this.label);

    this.content = new Gtk.Button( {
      label: content,
      margin_bottom: 20,
      margin_start: 15,
      margin_end: 15,
      css_classes: ["title-4", "accent"] } );
    this.content.connect("clicked", () => {
      navigate(this.data, this.navigation_view);
    } );
    this.append(this.content);
  }
});


const Link = GObject.registerClass({
  GTypeName: 'Link',
}, class extends Gtk.Button {
  constructor(data, navigation_view) {
    super({
      label: data.name,
      halign: Gtk.Align.CENTER,
      margin_bottom: 10,
      margin_start: 5,
      margin_end: 5,
      css_classes: ["heading", "accent"] });

    this.data = data;
    this.navigation_view = navigation_view;

    this.connect("clicked", () => {
      log(this.data)
      navigate(this.data, this.navigation_view);
    } );
  }
});


const ModuleCardRow = GObject.registerClass({
  GTypeName: 'ModuleCardRow',
}, class extends Gtk.Box {
  constructor(cards) {
    super({});
    this.spacing = 20;
    this.cards = cards;
    for (let i in this.cards) {
      this.append(this.cards[i]);
    }
  }
});

const ModuleTitle = GObject.registerClass({
  GTypeName: 'ModuleTitle',
}, class extends Gtk.Label {
  constructor(label, title) {
    super({});

    this.label = label;
    this.add_css_class("title-" + title);
  }
});

const ModuleText = GObject.registerClass({
  GTypeName: 'ModuleText',
}, class extends Gtk.Box {
  constructor(label) {
    super({});
    this.add_css_class("card");
    this.label = new Gtk.Label({
      label: label,
      wrap: true,
      margin_top: 10,
      margin_start: 10,
      margin_end: 10,
      margin_bottom: 10,
      hexpand: true });
    this.append(this.label);
  }
});

const ModuleMultiText = GObject.registerClass({
  GTypeName: 'ModuleMultiText',
}, class extends Gtk.ListBox {
  constructor(label) {
    super({});
    this.add_css_class("boxed-list");
    this.label = [];
    let table = null;
    for (let i in label) {
      if (label[i].split) label[i] = label[i].split("###");
    }
    label = label.flat();
    for (let i = 0; i < label.length; i++) {
      let listboxrow = null;
      if (label[i].includes("***")) {
        if (table != null) {
          this.append(new ModuleNTable(table));
          table = null;
        }
        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let label1 = new Gtk.Label({
          label: label[i].slice(3, label[i].lastIndexOf("***") - 1),
          wrap: true,
          margin_top: 10, margin_start: 10, margin_end: 10,
          hexpand: true,
          css_classes: ["heading"] } );
        let label2 = new Gtk.Label({
          label: label[i].slice(label[i].lastIndexOf("***") + 3),
          wrap: true,
          margin_top: 5, margin_start: 10, margin_end: 10, margin_bottom: 10,
          hexpand: true });
        box.append(label1);
        box.append(label2);
        listboxrow = new Gtk.ListBoxRow({
          activatable: false, selectable: false,
          halign: Gtk.Align.FILL,
          child: box });
      } else if (label[i].includes("|")) {
        if (table == null) table = [];
        let s = label[i].split("|");
        s = s.filter( (i) => i != "" );
        if (!s[0].includes("---")) table.push(s);
      } else {
        if (table != null) {
          this.append(new Gtk.ListBoxRow( {
            child: new ModuleNTable(table),
            activatable: false, selectable: false } ));
          table = null;
        }
        listboxrow = new Gtk.ListBoxRow({
          activatable: false, selectable: false,
          halign: Gtk.Align.FILL,
          child: new Gtk.Label({
            label: label[i],
            wrap: true,
            margin_top: 15, margin_start: 10, margin_end: 10, margin_bottom: 15,
            hexpand: true })
          });
      }
      if (listboxrow != null) this.append(listboxrow);
    }
  }
});

const Module2Table = GObject.registerClass({
  GTypeName: 'Module2Table',
}, class extends Gtk.Grid {
  constructor(object, first_desc, second_desc) {
    super({});
    this.add_css_class("card");
    this.attach(new Gtk.Label({
        label: first_desc,
        halign: Gtk.Align.CENTER,
        margin_top: 10, margin_bottom: 10 }),
      0, 0, 1, 1);
    this.attach(new Gtk.Label({
        label: second_desc,
        halign: Gtk.Align.CENTER,
        margin_top: 10, margin_bottom: 10 }),
      0, 2, 1, 1);

    this.attach(new Gtk.Separator({
        orientation: Gtk.Orientation.VERTICAL,
        halign: Gtk.Align.START }),
      1, 0, 1, 3);

    let counter = 2;
    for (let i in object) {
      this.attach(new Gtk.Label({
          label: i,
          halign: Gtk.Align.CENTER,
          margin_top: 10, margin_bottom: 10 }),
        counter, 0, 1, 1);
      this.attach(new Gtk.Label({
          label: object[i],
          halign: Gtk.Align.CENTER,
          margin_top: 10, margin_bottom: 10 }),
        counter, 2, 1, 1);
      counter++;
    }
    this.attach(new Gtk.Separator({
        orientation: Gtk.Orientation.HORIZONTAL,
        hexpand: true }),
      0, 1, counter, 1);

  }
});
const ModuleNTable = GObject.registerClass({
  GTypeName: 'ModuleNTable',
}, class extends Gtk.Grid {
  constructor(n) {
    super( { halign: Gtk.Align.FILL, hexpand: true} );
    log(n);
    for (let i in n) {
      for (let j in n[i]) {
        let l = new Gtk.Label( {
          hexpand: true,
          label: n[i][j],
          margin_top: 10, margin_bottom: 10 } );
        if (i == 0) l.css_classes = ["heading"];
        this.attach(l, j*2, i*2, 1, 1);

        if (j < n[i].length-1)
          this.attach(new Gtk.Separator(), j*2+1, i*2, 1, 1);
        if (i < n.length-1)
          this.attach(new Gtk.Separator(), j*2, i*2+1, 1, 1);
      }
    }
  }
});


const ModuleLinkList = GObject.registerClass({
  GTypeName: 'ModuleLinkList',
}, class extends Gtk.ListBox {
  constructor(label, navigation_view) {
    super({});
    this.add_css_class("boxed-list");
    this.label = label;
    for (let i = 0; i < label.length; i++) {
      let listboxrow = null;
      let data = label[i].item;
      listboxrow = new Adw.ActionRow({
        activatable: true, selectable: false,
        halign: Gtk.Align.FILL,
        title: data.name });

      listboxrow.connect("activated", () => {
        navigate(data, navigation_view);
      } );

      listboxrow.add_suffix(new Gtk.Image( {
          icon_name: "go-next-symbolic" } ));

      this.append(listboxrow);
    }
  }
});

const ModuleStatListRow = GObject.registerClass({
  GTypeName: 'ModuleStatListRow',
}, class extends Adw.ActionRow {
  constructor(label, stats) {
    super( { title: label, activatable: false, selectable: false } );
    for (let i = 0; i < stats.length; i++) {
      if (label != "" || i!= 0) this.add_suffix(new Gtk.Separator());
      this.add_suffix(new Gtk.Label( {
        label: stats[i], css_classes: ["heading"] } ));
    }
  }
});
const ModuleShortLinkListRow = GObject.registerClass({
  GTypeName: 'ModuleShortLinkListRow',
}, class extends Adw.ActionRow {
  constructor(label, stats, navigation_view) {
    super( { title: label, activatable: false, selectable: false } );
    for (let i = 0; i < stats.length; i++) {
      let l = new Link(stats[i], navigation_view);
      l.margin_top = 10;
      this.add_suffix(l);
    }
  }
});

const ModuleLinkListRow = GObject.registerClass({
  GTypeName: 'ModuleLinkListRow',
}, class extends Gtk.ListBoxRow {
  constructor(label, stats, navigation_view) {
    super( { activatable: false, selectable: false } );
    let vbox = new Gtk.Box( { orientation: Gtk.Orientation.VERTICAL } );
    this.set_child(vbox);
    vbox.append(new Gtk.Label( {
      label: label,
      css_classes: ["heading"],
      margin_top: 15, margin_bottom: 10 } ))
    for (var i = 0; i < stats.length-6; i += 6) {
      let hbox = new Gtk.Box( { halign: Gtk.Align.CENTER } );
      vbox.append(hbox);
      for (let j = i; j < i+6; j++) {
        hbox.append(new Link(stats[j], navigation_view));
      }
    }
    let hbox = new Gtk.Box( { halign: Gtk.Align.CENTER, margin_bottom: 5 } );
    vbox.append(hbox);
    for (let j = i; j < stats.length; j++) {
      hbox.append(new Link(stats[j], navigation_view));
    }
  }
});

const ResultPage = GObject.registerClass({
  GTypeName: 'ResultPage',
}, class extends Gtk.ScrolledWindow {
  constructor(data, navigation_view) {
    super({
      halign: Gtk.Align.FILL,
      hexpand: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER });

    this.navigation_view = navigation_view;

    this.data = data;

    this.old_title = this.navigation_view.tab_page.get_title();
    setTimeout(() => { this.navigation_view.tab_page.set_title(this.data.name); }, 10);

    this.back_wrapper = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    this.set_child(this.back_wrapper);

    this.back = new Gtk.Button({
      icon_name: "go-previous-symbolic",
      halign: Gtk.Align.START,
      margin_top: 20, margin_start: 20 });

    this.pin = new Gtk.Button({
      icon_name: "view-pin-symbolic",
      halign: Gtk.Align.END, hexpand: true,
      margin_top: 20, margin_end: 20 });
    if (this.navigation_view.tab_page.pinned) this.pin.add_css_class("success");
    this.pin.connect("clicked", () => {
      this.navigation_view.tab_view.set_page_pinned(this.navigation_view.tab_page, !this.navigation_view.tab_page.pinned);
      if (this.navigation_view.tab_page.pinned) {
        this.pin.set_css_classes(["success"]);
        bookmarks.push( { name: this.data.name, url: this.data.url } );
        save_state();
      } else {
        bookmarks.splice(bookmarks.map((i) => { return i.url; } ).indexOf(this.data.url), 1);
        save_state();
        this.pin.set_css_classes([]);
      }
    } );

    this.bar = new Gtk.Box( {
      orientation: Gtk.Orientation.HORIZONTAL,
      hexpand: true,
      halign:Gtk.Align.FILL } );

    this.bar.append(this.back);
    this.bar.append(this.pin);
    this.back_wrapper.append(this.bar);
    this.back.connect("clicked", () => {
      this.navigation_view.navigate(Adw.NavigationDirection.BACK);
      this.navigation_view.tab_page.set_title(this.old_title);
      if (this.navigation_view.get_visible_child().pin) {
        if (this.navigation_view.tab_page.pinned) this.navigation_view.get_visible_child().pin.set_css_classes(["success"]);
        else this.navigation_view.get_visible_child().pin.set_css_classes([]);
      }

      setTimeout(() => { this.navigation_view.remove(this); }, 1000);
    });

    this.clamp = new Adw.Clamp({
      maximum_size: 600,
      margin_start: 20, margin_end: 20, margin_bottom: 20 });
    this.back_wrapper.append(this.clamp);
    this.wrapper = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 20 });
    this.clamp.add_css_class("undershoot-top");
    this.clamp.add_css_class("undershoot-bottom");
    this.clamp.set_child(this.wrapper);

    if (this.data.full_name) this.wrapper.append(new ModuleTitle(this.data.full_name, 1));
    else this.wrapper.append(new ModuleTitle(this.data.name, 1));
  }
});

const SearchResultPageSpell = GObject.registerClass({
  GTypeName: 'SearchResultPageSpell',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);
    let firstRow = [];
    firstRow.push(new Card("Level", this.data.level.toString()));
    firstRow.push(new Card("Casting Time", this.data.casting_time));

    if (this.data.area_of_effect) firstRow.push(new Card("Range", this.data.range + " (" + this.data.area_of_effect.size.toString() + "ft " + this.data.area_of_effect.type + ")"));
    else firstRow.push(new Card("Range", this.data.range));
    firstRow.push(new Card("Components", this.data.components.join(", ")));
    this.wrapper.append(new ModuleCardRow(firstRow));

    let secondRow = [];
    secondRow.push(new Card("Duration", this.data.duration));
    secondRow.push(new LinkCard("School", this.data.school.name, this.data.school, this.navigation_view));
    if (this.data.attack_type) secondRow.push(new Card("Attack", this.data.attack_type));
    else if (this.data.dc) secondRow.push(new Card("Save", this.data.dc.dc_type.name + " Save"));
    if (this.data.damage) secondRow.push(new Card("Damage", this.data.damage.damage_type.name));
    else secondRow.push(new Card("Effect", "Buff"));
    this.wrapper.append(new ModuleCardRow(secondRow));
    this.wrapper.append(new ModuleTitle("Effect", 3));
    this.wrapper.append(new ModuleMultiText(this.data.desc));
    if (this.data.higher_level && this.data.higher_level.length > 0) {
      this.wrapper.append(new ModuleTitle("At higher Levels", 3));
      this.wrapper.append(new ModuleText(this.data.higher_level[0]));
    }
    if (this.data.damage && this.data.damage.damage_at_character_level) {
      this.wrapper.append(new Module2Table(this.data.damage.damage_at_character_level, "Character Level", "Damage"));
    }
    if (this.data.damage && this.data.damage.damage_at_slot_level) {
      this.wrapper.append(new Module2Table(this.data.damage.damage_at_slot_level, "Slot Level", "Damage"));
    }
    if (this.data.heal_at_slot_level) {
      this.wrapper.append(new Module2Table(this.data.heal_at_slot_level, "Slot Level", "Heal"));
    }

    this.wrapper.append(new ModuleLinkList(this.data.classes.map((i) => { return { item: i } } ), navigation_view ));

  }
});
const SearchResultPageArmor = GObject.registerClass({
  GTypeName: 'SearchResultPageArmor',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    let cards = [];
    cards.push(new LinkCard("Category", this.data.equipment_category.name, this.data.equipment_category, navigation_view));

    cards.push(new Card("Cost", this.data.cost.quantity.toString() + this.data.cost.unit));
    cards.push(new Card("Weight", this.data.weight.toString() + "lb"));
    cards.push(new Card("Armor Class", this.data.armor_class.base.toString() + (this.data.armor_class.dex_bonus ? " + Dex modifier" + (this.data.armor_class.max_bonus ? " (max " + this.data.armor_class.max_bonus.toString() + ")" : "") : "")));
    if (this.data.str_minimum != 0)
      cards.push(new Card("Strength", "min " + this.data.str_minimum.toString()));
    if (this.data.stealth_disadvantage != 0)
      cards.push(new Card("Stealth", "disadvantage"));
    cards.push(new Card("Type", this.data.armor_category));
    if (cards.length > 4) {
      this.wrapper.append(new ModuleCardRow(cards.slice(0, 3)));
      this.wrapper.append(new ModuleCardRow(cards.slice(3, cards.length)));
    } else
      this.wrapper.append(new ModuleCardRow(cards));


  }
});
const SearchResultPageGear = GObject.registerClass({
  GTypeName: 'SearchResultPageGear',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    let cards = [];
    cards.push(new LinkCard("Category", this.data.equipment_category.name, this.data.equipment_category, navigation_view));

    if (!this.data.quantity) cards.push(new Card("Cost", this.data.cost.quantity.toString() + this.data.cost.unit));
    else cards.push(new Card("Cost", this.data.cost.quantity.toString() + this.data.cost.unit + " per " + this.data.quantity.toString()));
    if (!this.data.quantity) cards.push(new Card("Weight", this.data.weight.toString() + "lb"));
    else cards.push(new Card("Weight", this.data.weight.toString() + "lb per " + this.data.quantity.toString()));
    if (this.data.gear_category) cards.push(new Card("Type", this.data.gear_category.name));
    else if (this.data.vehicle_category) cards.push(new Card("Type", this.data.vehicle_category));
    else if (this.data.tool_category) cards.push(new Card("Type", this.data.tool_category));
    if (cards.length > 4) {
      this.wrapper.append(new ModuleCardRow(cards.slice(0, 3)));
      this.wrapper.append(new ModuleCardRow(cards.slice(3, cards.length)));
    } else
      this.wrapper.append(new ModuleCardRow(cards));
    if (this.data.desc && this.data.desc.length > 0) {
      this.wrapper.append(new ModuleTitle("Description", 3));
      this.wrapper.append(new ModuleMultiText(this.data.desc));
    }

  }
});
const SearchResultPageMagicGear = GObject.registerClass({
  GTypeName: 'SearchResultPageMagicGear',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    let cards = [];
    cards.push(new Card("Rarity", this.data.rarity.name));
    this.wrapper.append(new ModuleCardRow(cards));

    if (this.data.desc.length > 0) {
      this.wrapper.append(new ModuleTitle("Description", 3));
      this.wrapper.append(new ModuleMultiText(this.data.desc));
    }
    if (this.data.variants.length > 0) {
      this.wrapper.append(new ModuleLinkList(this.data.variants.map( (i) => { return { item: i }; } ), this.navigation_view));
    }

  }
});
const SearchResultPageBundle = GObject.registerClass({
  GTypeName: 'SearchResultPageBundle',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    let cards = [];
    cards.push(new LinkCard("Category", this.data.equipment_category.name, this.data.equipment_category, navigation_view));
    if (!this.data.quantity) cards.push(new Card("Cost", this.data.cost.quantity.toString() + this.data.cost.unit));
    else cards.push(new Card("Cost", this.data.cost.quantity.toString() + this.data.cost.unit + " per " + this.data.quantity.toString()));
    if (this.data.gear_category) cards.push(new Card("Type", this.data.gear_category.name));
    else if (this.data.vehicle_category) cards.push(new Card("Type", this.data.vehicle_category));
    else if (this.data.tool_category) cards.push(new Card("Type", this.data.tool_category));

    if (cards.length > 4) {
      this.wrapper.append(new ModuleCardRow(cards.slice(0, 3)));
      this.wrapper.append(new ModuleCardRow(cards.slice(3, cards.length)));
    } else
      this.wrapper.append(new ModuleCardRow(cards));
    if (this.data.desc && this.data.desc.length > 0) {
      this.wrapper.append(new ModuleTitle("Description", 3));
      this.wrapper.append(new ModuleMultiText(this.data.desc));
    }

    this.content_list = new ModuleLinkList(this.data.contents, this.navigation_view);
    this.wrapper.append(this.content_list);

  }
});

const SearchResultPageSchool = GObject.registerClass({
  GTypeName: 'SearchResultPageSchool',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);
    this.data = data;
    this.wrapper.append(new ModuleText(this.data.desc));

  }
});

const SearchResultPageAlignment = GObject.registerClass({
  GTypeName: 'SearchResultPageAlignment',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);
    this.data = data;
    this.wrapper.append(new ModuleText(this.data.desc));

  }
});

const SearchResultPageSkill = GObject.registerClass({
  GTypeName: 'SearchResultPageSkill',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);
    this.data = data;

    let cards = [];
    cards.push(new LinkCard("Ability Score", get_sync(this.data.ability_score.url).full_name, this.data.ability_score, this.navigation_view));

    for (var i = 0; i < cards.length-6; i += 6) {
      this.wrapper.append(new ModuleCardRow(cards.slice(i, i+6)));
    }
    this.wrapper.append(new ModuleCardRow(cards.slice(i-6, cards.length)));
    this.wrapper.append(new ModuleMultiText(this.data.desc));

  }
});

const SearchResultPageAbilityScore = GObject.registerClass({
  GTypeName: 'SearchResultPageAbilityScore',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);
    this.data = data;

    this.wrapper.append(new ModuleMultiText(this.data.desc));
    this.wrapper.append(new ModuleLinkList(this.data.skills.map( (i) => { return { item: i }; } ), this.navigation_view));

  }
});


const SearchResultPageEquipmentCategory = GObject.registerClass({
  GTypeName: 'SearchResultPageEquipmentCategory',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);
    this.data = data;

    this.wrapper.append(new ModuleLinkList(this.data.equipment.map( (i) => { return { item: i }; } ), this.navigation_view));

  }
});

const SearchResultPageFeature = GObject.registerClass({
  GTypeName: 'SearchResultPageFeature',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);
    this.data = data;

    let cards = [];
    cards.push(new Card("Level", this.data.level.toString()));

    for (var i = 0; i < cards.length-6; i += 6) {
      this.wrapper.append(new ModuleCardRow(cards.slice(i, i+6)));
    }
    this.wrapper.append(new ModuleCardRow(cards.slice(i-6, cards.length)));

    this.wrapper.append(new ModuleMultiText(this.data.desc));
    let arr = [];
    arr.push({item: this.data.class});
    if (this.data.sub_class) arr.push({item: this.data.sub_class});
    this.wrapper.append(new ModuleLinkList(arr, this.navigation_view));
  }
});
const Image = GObject.registerClass({
  GTypeName: 'Image',
}, class extends Adw.Bin {
  constructor(image) {
    super({});
    let response = get_any_sync(image);
    let loader = new GdkPixbuf.PixbufLoader()
    loader.write_bytes(GLib.Bytes.new(response))
    loader.close()
    let img = new Gtk.Picture( { css_classes: ["card"], halign: Gtk.Align.CENTER, valign: Gtk.Align.FILL, vexpand: true, height_request: 300 } );
    img.set_pixbuf(loader.get_pixbuf());
    this.set_child(img);
  }
});

const ImageAsync = GObject.registerClass({
  GTypeName: 'ImageAsync',
}, class extends Adw.Bin {
  constructor(image) {
    super( { css_classes: ["card"], halign: Gtk.Align.CENTER, valign: Gtk.Align.FILL, vexpand: true, height_request: 400, width_request: 600 } );
    get_any_async(image, (response) => {
      let loader = new GdkPixbuf.PixbufLoader()
      loader.write_bytes(GLib.Bytes.new(response))
      loader.close()
      let img = new Gtk.Picture( { css_classes: ["card"] } );
      img.set_pixbuf(loader.get_pixbuf());
      let revealer = new Gtk.Revealer( { child: img, transition_type: Gtk.RevealerTransitionType.CROSSFADE } );
      this.set_child(revealer);
      revealer.set_reveal_child(true);
      this.width_request = -1;
    });
    let spinner = new Gtk.Spinner( { halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER } );
    spinner.start();
    this.set_child(spinner);
  }
});


const SearchResultPageMonster = GObject.registerClass({
  GTypeName: 'SearchResultPageMonster',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    if (this.data.image) {
      this.wrapper.append(new ImageAsync(this.data.image));
      log("##################");
    }

    let cards = [];
    cards.push(new Card("Strength", this.data.strength.toString()+" / "+score_to_modifier(this.data.strength.toString())));
    cards.push(new Card("Dexterity", this.data.dexterity.toString()+" / "+score_to_modifier(this.data.dexterity.toString())));
    cards.push(new Card("Constitution", this.data.constitution.toString()+" / "+score_to_modifier(this.data.constitution.toString())));
    cards.push(new Card("Intelligence", this.data.intelligence.toString()+" / "+score_to_modifier(this.data.intelligence.toString())));
    cards.push(new Card("Wisdom", this.data.wisdom.toString()+" / "+score_to_modifier(this.data.wisdom.toString())));
    cards.push(new Card("Charisma", this.data.charisma.toString()+" / "+score_to_modifier(this.data.charisma.toString())));
    log("/api/alignments/"+this.data.alignment.toString().split(" ").join("-"));
    cards.push(new LinkCard("Alignment", this.data.alignment.toString(), {name: this.data.alignment.toString().split(" ").join("-"), url: "/api/alignments/"+this.data.alignment.toString().split(" ").join("-")}, this.navigation_view));
    cards.push(new Card("Armor Class", this.data.armor_class[0].value.toString()));
    if (this.data.hit_dice) cards.push(new Card("Hit Dice", this.data.hit_dice.toString()));
    cards.push(new Card("Type", this.data.type));
    if (this.data.subtype) cards.push(new Card("Subtype", this.data.subtype));
    cards.push(new Card("Challenge Rating", this.data.challenge_rating.toString()));
    cards.push(new Card("Size", this.data.size));

    let s = [];
    if (this.data.speed.walk)   s.push(this.data.speed.walk + " walk");
    if (this.data.speed.swim)   s.push(this.data.speed.swim + " swim");
    if (this.data.speed.fly)    s.push(this.data.speed.fly + " fly");
    if (this.data.speed.burrow) s.push(this.data.speed.burrow + " burrow");
    if (this.data.speed.climb) s.push(this.data.speed.climb + " climb");
    cards.push(new Card("Speed", s.join(", ")));

    cards.push(new Card("Hit Points", this.data.hit_points.toString() + " / " + this.data.hit_points_roll));

    for (var i = 0; i < cards.length-6; i += 6) {
      this.wrapper.append(new ModuleCardRow(cards.slice(i, i+6)));
    }
    this.wrapper.append(new ModuleCardRow(cards.slice(i-6, cards.length)));
    this.statrows = new Gtk.ListBox( { css_classes: ["boxed-list"] } );
    this.wrapper.append(this.statrows);
    this.statrows.append(new ModuleStatListRow("Languages", this.data.languages.split(", ")));
    s = [];
    if (this.data.senses.blindsight  != undefined) s.push("blindsight "+this.data.senses.blindsight);
    if (this.data.senses.darkvision  != undefined) s.push("darkvision "+this.data.senses.darkvision);
    if (this.data.senses.tremorsense != undefined) s.push("tremorsense "+this.data.senses.tremorsense);
    if (this.data.senses.truesight   != undefined) s.push("truesight "+this.data.senses.truesight);
    this.statrows.append(new ModuleStatListRow("Senses", s));
    this.statrows.append(new ModuleStatListRow("Saving Throws", this.data.proficiencies.filter((i) => { return i.proficiency.name.includes("Saving Throw"); } ).map( (i) => { return "+" + i.value.toString() + " " + i.proficiency.index.slice(i.proficiency.index.lastIndexOf("-")+1, i.proficiency.index.length)} )));
    this.statrows.append(new ModuleStatListRow("Skills", this.data.proficiencies.filter((i) => { return i.proficiency.name.includes("Skill"); } ).map( (i) => { return "+" + i.value.toString() + " " + i.proficiency.index.slice(i.proficiency.index.lastIndexOf("-")+1, i.proficiency.index.length)} )));

    if (this.data.desc) this.wrapper.append(new ModuleText(this.data.desc));

    if (this.data.special_abilities)  {
      this.wrapper.append(new ModuleTitle("Abilities", 4));
      this.wrapper.append(new ModuleMultiText(this.data.special_abilities.map( (i) => { return "***"+ (!i.usage ? i.name : (i.name + " (" +i.usage.times+" "+i.usage.type+")" )) + ".***" + i.desc; } )));
    }

    this.wrapper.append(new ModuleTitle("Actions", 4));
    this.wrapper.append(new ModuleMultiText(this.data.actions.map( (i) => { return "***"+ (!i.usage ? i.name : (i.name + " (" +i.usage.times+" "+i.usage.type+")" )) + ".***" + i.desc; } )));

    if (this.data.legendary_actions && this.data.legendary_actions.length > 0) {
      this.wrapper.append(new ModuleTitle("Legendary Actions", 4));
      this.wrapper.append(new ModuleMultiText(this.data.legendary_actions.map( (i) => { return "***"+ (!i.usage ? i.name : (i.name + " (" +i.usage.times+" "+i.usage.type+")" )) + ".***" + i.desc; } )));
    }
  }
});

const SearchResultPageClass = GObject.registerClass({
  GTypeName: 'SearchResultPageClass',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    let cards = [];
    cards.push(new Card("Hit die", "d"+this.data.hit_die.toString() + " ("+Math.ceil(this.data.hit_die / 2 +0.5)+")"));
    cards.push(new Card("HP at Level 1", "Constitution + "+this.data.hit_die ));
    if (this.data.spellcasting) cards.push(new LinkCard("Spellcasting", this.data.spellcasting.spellcasting_ability.name, this.data.spellcasting.spellcasting_ability));
    else cards.push(new Card("Spellcasting", "none"));

    for (var i = 0; i < cards.length-6; i += 6) {
      this.wrapper.append(new ModuleCardRow(cards.slice(i, i+6)));
    }
    this.wrapper.append(new ModuleCardRow(cards.slice(i-6, cards.length)));

    this.statrows = new Gtk.ListBox( { css_classes: ["boxed-list"] } );
    this.wrapper.append(this.statrows);
    for (let i in this.data.proficiency_choices) {
      if (!this.data.proficiency_choices[i].from.options[0].item) {
        this.statrows.append(new ModuleStatListRow(this.data.proficiency_choices[i].desc, []));
      } else {
        let s = "";
        let arr = this.data.proficiency_choices[i].from.options;
        arr = arr.map((i) => { return get_sync(i.item.url).reference; } );
        if (this.data.proficiency_choices[i].from.options[0].item.name.includes("Skill")) {
          s = "Skills: Choose "+this.data.proficiency_choices[i].choose.toString();
        } else {
          s = this.data.proficiency_choices[i].desc;
        }
        this.statrows.append(new ModuleLinkListRow(s, arr, this.navigation_view));
      }
    }
    this.statrows.append(new ModuleLinkListRow("Proficiencies", this.data.proficiencies.filter((i) => { return !i.url.includes("saving-throw") }).map((i) => { return get_sync(i.url).reference; } ), this.navigation_view));
    this.statrows.append(new ModuleShortLinkListRow("Saving Throws", this.data.saving_throws, this.navigation_view));
    if (this.data.spellcasting) {
      this.wrapper.append(new ModuleTitle("Spellcasting", 4));
      let arr = this.data.spellcasting.info.map((i) => { return "***"+i.name+".***"+i.desc.join("###"); });
      this.wrapper.append(new ModuleMultiText(arr));
    }
    this.wrapper.append(new ModuleTitle("Starting Equipment", 4));
    this.wrapper.append(new ModuleLinkList(this.data.starting_equipment.map((i) => { return { item: { url: i.equipment.url, name: i.quantity > 1 ? (i.quantity.toString() + "x "+  i.equipment.name) : i.equipment.name }}; } ), this.navigation_view));
    this.wrapper.append(new ModuleMultiText(this.data.starting_equipment_options.map((i) => i.desc ), 4));

    this.wrapper.append(new ModuleTitle("Subclasses", 4));
    this.wrapper.append(new ModuleLinkList(this.data.subclasses.map((i) => { return { item: i}; } ), this.navigation_view));

    let level_data = get_sync(this.data.class_levels);

    let level_select = new Gtk.Box( { halign: Gtk.Align.CENTER, spacing: 10 } );
    this.wrapper.append(level_select);
    level_select.append(new Gtk.Label( { label: "Stats on Level", css_classes: ["title-4"] } ));
    this.level_spin = Gtk.SpinButton.new_with_range(1, 20, 1);
    level_select.append(this.level_spin);

    this.level_children = [];
    this.level_box = new Gtk.Box( {
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 30 } );
    this.wrapper.append(this.level_box);

    this.update_levels = () => {
      for (let i in this.level_children) {
        this.level_box.remove(this.level_children[i]);
      }
      this.level_children = [];

      let d = level_data[this.level_spin.value-1];
      log(this.level_select);
      if (d.spellcasting) {
        let t = {};
        let n = 0;
        for (let i in d.spellcasting) {
          if (!i.includes("known")) {
            n++;
            t[n] = d.spellcasting[i].toString();
          }
        }
        this.level_children.push(new Module2Table(t, "Slot Level", "Spell Slots"));
      }
      cards = [];
      if (d.prof_bonus) cards.push(new Card("Proficiency bonus", "+" + d.prof_bonus.toString()));
      if (d.spellcasting && d.spellcasting.spells_known) cards.push(new Card("Spells known", d.spellcasting.spells_known.toString()));
      if (d.spellcasting && d.spellcasting.cantrips_known) cards.push(new Card("Cantrips known", d.spellcasting.cantrips_known.toString()));
      let c = d.class_specific;
      for (let i in c) {
        cards.push(new Card(i.split("_").join(" "), c[i].toString()));
      }

      for (var i = 0; i < cards.length-4; i += 4) {
        this.level_children.push(new ModuleCardRow(cards.slice(i, i+4)));
      }
      this.level_children.push(new ModuleCardRow(cards.slice(i-4, cards.length)));
      for (let i in this.level_children) {
        this.level_box.append(this.level_children[i]);
      }
    }
    this.update_levels();
    this.level_spin.connect("notify::value", this.update_levels);


    this.wrapper.append(new ModuleTitle("Features", 4));
    let level_list = new Gtk.ListBox( { css_classes: ["boxed-list"] } );
    for (let i in level_data) {
      level_list.append(new ModuleLevelRow(level_data[i], this.navigation_view));
    }
    this.wrapper.append(level_list);
  }
});

const SearchResultPageSubclass = GObject.registerClass({
  GTypeName: 'SearchResultPageSubclass',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    this.wrapper.append(new ModuleMultiText(data.desc));

    let level_data = get_sync(this.data.subclass_levels);

    this.wrapper.append(new ModuleTitle("Features", 4));
    let level_list = new Gtk.ListBox( { css_classes: ["boxed-list"] } );
    for (let i in level_data) {
      level_list.append(new ModuleLevelRow(level_data[i], this.navigation_view));
    }
    this.wrapper.append(level_list);

    if (this.data.spells) {
      let spells = this.data.spells.map((i) => { return { name: i.spell.name + ": " + i.prerequisites.map((j) => { if ( j.type != "level") log("Whaaat check subclass spells"); return "Level"+j.name.slice(-2); }).join(" "), url: i.spell.url } } );
      this.wrapper.append(new ModuleLinkList(spells.map((i) => { return { item: i }; } ), navigation_view));
    }


    if (level_data[0].subclass_specific) {
      let specific = [["Level"]];
      for (let j in level_data[0].subclass_specific) {
        specific[0].push(j.split("_").join(" "));
      }
      for (let i in level_data) {
        specific[i+1] = [i];
        for (let j in level_data[i].subclass_specific) {
          specific[i+1].push(level_data[i].subclass_specific[j].toString());
        }
      }
      this.wrapper.append(new Adw.Bin( { css_classes: ["card"], child: new ModuleNTable(specific) } ));
    }

  }
});



const ModuleLevelRow = GObject.registerClass({
  GTypeName: 'ModuleLevelRow',
}, class extends Gtk.ListBoxRow {
  constructor(data, navigation_view) {
    super( {activatable: false, selectable: false } );
    let vbox = new Gtk.Box( {
      orientation: Gtk.Orientation.VERTICAL,
      valign: Gtk.Align.CENTER,
      vexpand: true
    } );
    this.set_child(vbox);
    let first_row = new Gtk.Box( {
      orientation: Gtk.Orientation.HORIZONTAL,
      valign: Gtk.Align.CENTER,
      vexpand: true
    } );
    vbox.append(first_row);
    first_row.append( new Gtk.Label( {
      label: data.level.toString(),
      margin_start: 15, margin_top: 15, margin_bottom: 15, margin_end: 15
    } ));
    for(let i in data.features) {
      let l = new Link(data.features[i], navigation_view)
      l.margin_top = 10;
      first_row.append(l);
    }

    let second_row = new Gtk.Box( {
      orientation: Gtk.Orientation.HORIZONTAL,
      valign: Gtk.Align.CENTER,
      vexpand: true
    } );
  }
});

const SearchResultPageRace = GObject.registerClass({
  GTypeName: 'SearchResultPageRace',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    let cards = [];
    cards.push(new Card("Speed", this.data.speed + "ft"));
    cards.push(new Card("Size", this.data.size));

    for (var i = 0; i < cards.length-6; i += 6) {
      this.wrapper.append(new ModuleCardRow(cards.slice(i, i+6)));
    }
    this.wrapper.append(new ModuleCardRow(cards.slice(i-6, cards.length)));

    this.wrapper.append(new ModuleMultiText([
      "***Age.***"+this.data.age,
      "***Alignment.***"+this.data.alignment,
      "***Languages.***"+this.data.language_desc,
      "***Size.***"+this.data.size_description]));

    this.statrows = new Gtk.ListBox( { css_classes: ["boxed-list"] } );
    this.wrapper.append(this.statrows);
    for (let i in this.data.starting_proficiency_choices) {
      if (!this.data.starting_proficiency_choices[i].from.options[0].item) {
        this.statrows.append(new ModuleStatListRow(this.data.starting_proficiency_choices[i].desc, []));
      } else {
        let s = "";
        let arr = this.data.starting_proficiency_choices[i].from.options;
        arr = arr.map((i) => { return get_sync(i.item.url).reference; } );
        if (this.data.starting_proficiency_choices[i].from.options[0].item.name.includes("Skill")) {
          s = "Skills: Choose "+this.data.starting_proficiency_choices[i].choose.toString();
        } else {
          s = this.data.starting_proficiency_choices[i].desc;
        }
        this.statrows.append(new ModuleLinkListRow(s, arr, this.navigation_view));
      }
    }
    this.statrows.append(new ModuleShortLinkListRow("Proficiencies", this.data.starting_proficiencies.filter((i) => { return !i.url.includes("saving-throw") }).map((i) => { return get_sync(i.url).reference; } ), this.navigation_view));
    this.statrows.append(new ModuleStatListRow("Ability bonuses", this.data.ability_bonuses.map((i) => { return "+"+i.bonus.toString() + " " +i.ability_score.name } )));
    this.statrows.append(new ModuleStatListRow("Languages", this.data.languages.map((i) => i.name)));

    this.wrapper.append(new ModuleTitle("Traits", 4));
    this.wrapper.append(new ModuleLinkList(this.data.traits.map((i) => { return { item: i }; }), this.navigation_view));

    this.wrapper.append(new ModuleTitle("Subraces", 4));
    this.wrapper.append(new ModuleLinkList(this.data.subraces.map((i) => { return { item: i}; } ), this.navigation_view));

  }
});


const SearchResultPageTrait = GObject.registerClass({
  GTypeName: 'SearchResultPageTrait',
}, class extends ResultPage {
  constructor(data, navigation_view) {
    super(data, navigation_view);

    this.wrapper.append(new ModuleMultiText(this.data.desc));

    this.statrows = new Gtk.ListBox( { css_classes: ["boxed-list"] } );
    let hascontent = false;
    // for some unholy reason this.data.proficiency_choices isn't an array in the API like literally everywhere else!
    // and does not have the same attributes
    if (this.data.proficiency_choices) {
      hascontent = true;
      let s = "Choose " + this.data.proficiency_choices.choose + ":";
      let arr = this.data.proficiency_choices.from.options.map((i)=>i.item);
      this.statrows.append(new ModuleShortLinkListRow(s, arr, this.navigation_view));
    }

    if (this.data.proficiencies && this.data.proficiencies.length > 0) {
      hascontent = true;
      this.statrows.append(new ModuleLinkListRow(
        "Proficiencies",
        this.data.proficiencies.filter((i) => {
            return !i.url.includes("saving-throw")
          }).map((i) => {
            return get_sync(i.url).reference;
          } ),
        this.navigation_view));
    }

    if (this.data.language_options) {
      hascontent = true;
      this.statrows.append(new ModuleText(this.data.language_options.desc));
    }

    if (this.data.trait_specific) {
      hascontent = true;
      this.statrows.append(new ModuleText(this.data.trait_specific.desc));
    }

    if (hascontent) this.wrapper.append(this.statrows);

    if (this.data.subraces.length > 0) {
      this.wrapper.append(new ModuleTitle("Subraces", 4));
      this.wrapper.append(new ModuleLinkList(this.data.subraces.map((i) => { return { item: i}; } ), this.navigation_view));
    }
    this.wrapper.append(new ModuleTitle("Races", 4));
    this.wrapper.append(new ModuleLinkList(this.data.races.map((i) => { return { item: i}; } ), this.navigation_view));

  }
});


const SearchTab = GObject.registerClass({
  GTypeName: 'SearchTab',
}, class extends Tab {
  constructor(applied_filters, navigation_view) {
    super({});
    setTimeout(() => { this.navigation_view.tab_page.set_title("Search"); }, 1);
    this.navigation_view = navigation_view;
    this.set_hexpand(true)
    this.navigation_view.append(this);

    this.scrolled_window = new Gtk.ScrolledWindow();
    this.scrolled_window.set_halign(Gtk.Align.FILL);
    this.scrolled_window.set_hexpand(true);
    this.scrolled_window.set_size_request(400, 0);

    this.scrolled_window.add_css_class("undershoot-top");
    this.scrolled_window.add_css_class("undershoot-bottom");

    this.append(this.scrolled_window);

    this.back_wrapper = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    this.scrolled_window.set_child(this.back_wrapper);

    this.pin = new Gtk.Button({
      icon_name: "view-pin-symbolic",
      halign: Gtk.Align.END, hexpand: true,
      margin_top: 20, margin_end: 20 });
    // if (this.navigation_view.tab_page.pinned) this.pin.add_css_class("success");
    this.pin.connect("clicked", () => {
      this.navigation_view.tab_view.set_page_pinned(this.navigation_view.tab_page, !this.navigation_view.tab_page.pinned);
      if (this.navigation_view.tab_page.pinned) this.pin.set_css_classes(["success"]);
      else this.pin.set_css_classes([]);
    } );

    this.bar = new Gtk.Box();
    this.back_wrapper.append(this.bar);

    this.back = new Gtk.Button({ icon_name: "go-previous-symbolic", halign: Gtk.Align.START, margin_top: 20, margin_start: 20 });
    this.bar.append(this.back);
    this.bar.append(this.pin);
    this.back.connect("clicked", () => {
      if (!this.navigation_view.can_navigate_back) return;
      this.navigation_view.navigate(Adw.NavigationDirection.BACK);
      setTimeout(() => { this.navigation_view.remove(this); }, 1000);
    });

    this.list_box = new Gtk.ListBox();
    this.list_box.set_halign(Gtk.Align.CENTER);
    this.list_box.set_margin_top(5);
    this.list_box.set_margin_bottom(15);
    this.list_box.add_css_class("boxed-list")
    this.list_box.set_selection_mode(Gtk.SelectionMode.NONE);
    this.back_wrapper.append(this.list_box);
    this.entry = new Adw.EntryRow();
    this.entry.set_title("Search...");
    this.entry.set_size_request(380, 0);
    this.list_box.append(this.entry);

    this.filter_button = new Gtk.MenuButton({ iconName: "system-search-symbolic" });
    this.filter_menu = new Gio.Menu();
    for (let i in filter_options) {
      this.filter_menu.append(filter_options[i].title, "win.filter_" + i);
    }
    this.filter_button.set_menu_model(this.filter_menu);
    this.filter_button.add_css_class("flat");
    this.filter_button.set_valign(Gtk.Align.CENTER);
    this.entry.add_suffix(this.filter_button);

    this.filter_hider = new Gtk.Revealer();
    this.list_box.append(this.filter_hider);
    this.filter_row = new Adw.ActionRow();
    this.filters = [];
    for (let i in this.filters) {
      this.filter_row.add_prefix(this.filters[i]);
    }
    this.filter_hider.set_child(this.filter_row);
    // this.filter_hider.set_reveal_child(true);
    this.remove_filter = (filter) => {
      this.filter_row.remove(filter);
      this.filters.splice(this.filters.indexOf(filter), 1);
      if (this.filters.length <= 0) {
        this.filter_hider.set_reveal_child(false);
      }
      this.update_search();
    }
    this.add_filter = (index) => {
      var filter = new Filter(this, filter_options[index]);
      this.filters.push(filter);
      this.filter_row.add_prefix(filter);
      this.filter_hider.set_reveal_child(true);
      this.update_search();
    }

    this.search_term = "";
    this.update_search = () => {
      this.search_term = this.entry.get_text();
      for (let i = 0; i < this.results.length; i++) {
        if (this.search_term == "" || this.results[i].name.toLowerCase().includes(this.search_term.toLowerCase()) || this.search_term.toLowerCase().includes(this.results[i].name.toLowerCase())) {
          if (this.filters.length == 0) {
            this.results[i].visible = true;
            continue;
          }
          let found = false;
          for (let j = 0; j < this.filters.length; j++) {
            if (this.filters[j].options.func(this.results[i].data.url, this.filters[j])) found = true;
          }
          if (found) {
            this.results[i].visible = true;
            continue;
          }
        }
        this.results[i].visible = false;
      }
    }
    this.entry.connect("changed", this.update_search);

    this.results = [];
    this.results = this.results.concat(get_sync("/api/races").results.map((a) => new SearchResult(a)));
    this.results = this.results.concat(get_sync("/api/magic-items").results.map((a) => new SearchResult(a)));
    this.results = this.results.concat(get_sync("/api/monsters").results.map((a) => new SearchResult(a)));
    this.results = this.results.concat(get_sync("/api/spells").results.map((a) => new SearchResult(a)));
    this.results = this.results.concat(get_sync("/api/equipment").results.map((a) => new SearchResult(a)));
    this.results = this.results.concat(get_sync("/api/alignments").results.map((a) => new SearchResult(a)));
    this.results = this.results.concat(get_sync("/api/magic-schools").results.map((a) => new SearchResult(a)));
    this.results = this.results.concat(get_sync("/api/classes").results.map((a) => new SearchResult(a)));


    for (let i in this.results) {
      this.list_box.append(this.results[i]);
      this.results[i].connect("activated", () => { this.open_result(i); });
    }

    this.open_result = (i) => {
      navigate(this.results[i].data, this.navigation_view);
    }
    this.close_result = () => {
      this.navigation_view.navigate(Adw.NavigationDirection.BACK);
      setTimeout(() => { this.navigation_view.remove(this.open_result_page); this.open_result_page = null; }, 100);
    }


  }
});



const score_to_modifier = (score) => {
  let table = {"1": "-5",
    "2": "-4", "3": "-4",
    "4": "-3", "5": "-3",
    "6": "-2", "7": "-2",
    "8": "-1", "9": "-1",
    "10": "0", "11": "0",
    "12": "+1", "13": "+1",
    "14": "+2", "15": "+2",
    "16": "+3", "17": "+3",
    "18": "+4", "19": "+4",
    "20": "+5", "21": "+5",
    "22": "+6", "23": "+6",
    "24": "+7", "25": "+7",
    "26": "+8", "27": "+8",
    "28": "+9", "29": "+9",
    "30": "wow +10"};
  return table[score];
}

const navigate = (data, navigation_view) => {
  var page_data = get_sync(data.url);
  var page = null;
  if (page_data.armor_category) {
    page = new SearchResultPageArmor(page_data, navigation_view);
  } else if (page_data.url.includes("equipment") && !page_data.contents&& !page_data.url.includes("equipment-categories")) {
    page = new SearchResultPageGear(page_data, navigation_view);
  } else if (page_data.components) {
    page = new SearchResultPageSpell(page_data, navigation_view);
  } else if (page_data.contents && page_data.contents.length > 0) {
    page = new SearchResultPageBundle(page_data, navigation_view);
  } else if (page_data.url.includes("magic-schools")) {
    page = new SearchResultPageSchool(page_data, navigation_view);
  } else if (page_data.url.includes("monsters")) {
    page = new SearchResultPageMonster(page_data, navigation_view);
  } else if (page_data.url.includes("alignments")) {
    page = new SearchResultPageAlignment(page_data, navigation_view);
  } else if (page_data.url.includes("magic-items")) {
    page = new SearchResultPageMagicGear(page_data, navigation_view);
  } else if (page_data.url.includes("classes") && !page_data.url.includes("subclasses")) {
    page = new SearchResultPageClass(page_data, navigation_view);
  } else if (page_data.url.includes("skills")) {
    page = new SearchResultPageSkill(page_data, navigation_view);
  } else if (page_data.url.includes("ability-scores")) {
    page = new SearchResultPageAbilityScore(page_data, navigation_view);
  } else if (page_data.url.includes("features")) {
    page = new SearchResultPageFeature(page_data, navigation_view);
  } else if (page_data.url.includes("equipment-categories")) {
    page = new SearchResultPageEquipmentCategory(page_data, navigation_view);
  } else if (page_data.url.includes("subclasses")) {
    page = new SearchResultPageSubclass(page_data, navigation_view);
  } else if (page_data.url.includes("races")) {
    page = new SearchResultPageRace(page_data, navigation_view);
  } else if (page_data.url.includes("traits")) {
    page = new SearchResultPageTrait(page_data, navigation_view);
  }

  navigation_view.append(page);
  navigation_view.set_visible_child(page);
  log("navigated to " + data.url)
  return;
}



function get_sync(url) {
  if (use_local) {
    // log("yay local request " + url);
    let sub = url.split("/")[2];
    sub = sub.split("-").join("_");
    let array = API[sub];
    if (!url.split("/")[3]) {
      return { results: array };
    }
    let key = url.split("/")[3];
    if (url.split("/")[4]) {
      array = API[url.split("/")[4]];
      return array.filter((i) => i.url.includes(url.split("/")[3]));
    }
    let index = array.map((i) => i.index).indexOf(key);
    return array[index];
  } else {
    let msg = Soup.Message.new('GET', 'https://www.dnd5eapi.co' + url);

    log("sending");
    let s = session.send_and_read(msg, Gio.Cancellable.new()).get_data();
    log("parsing");
    return JSON.parse(Decoder.decode(s));
  }
}

function get_any_sync(url) {
  let msg = Soup.Message.new('GET', 'https://www.dnd5eapi.co' + url);
  return session.send_and_read(msg, Gio.Cancellable.new()).get_data();

}


function get_any_async(url, callback) {
  log("+++++++++++++++++++++++++");
  let msg = Soup.Message.new('GET', 'https://www.dnd5eapi.co' + url);
  session.send_and_read_async(msg, 1, Gio.Cancellable.new(), (a, b, c) => { callback(session.send_and_read_finish(b).get_data()); });
  log("---------------");
}


function read_sync(path) {
  const file = Gio.File.new_for_path(path);

  const [contents, etag] = file.load_contents(null);

  const decoder = new TextDecoder('utf-8');
  const contentsString = decoder.decode(contents);
  return contentsString;
}







var bookmarks = [ { url: "/api/monsters/aboleth", name: "Aboleth" } ];




function save_state() {
  let data = {
    bookmarks: bookmarks,
  };
  let dataJSON = JSON.stringify(data);
  let dataDir = GLib.get_user_config_dir();
  let destination = GLib.build_filenamev([dataDir, 'questscribe_state.json']);
  let file = Gio.File.new_for_path(destination);
  let [success, tag] = file.replace_contents(dataJSON, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
  if(success) log("saved state");
  else log("error saving state");
}

function load_state() {
  let dataDir = GLib.get_user_config_dir();
  let destination = GLib.build_filenamev([dataDir, 'questscribe_state.json']);
  let file = Gio.File.new_for_path(destination);

  const [ok, contents, etag] = file.load_contents(null);
  const decoder = new TextDecoder();
  const contentsString = decoder.decode(contents);
  let data = JSON.parse(contentsString);
  bookmarks = data.bookmarks;

  for (let i in data.bookmarks) {
    let tab = new_tab_from_data(data.bookmarks[i]);
    tab.navigation_view.tab_view.set_page_pinned(tab.navigation_view.tab_page, true);
    tab.navigation_view.visible_child.pin.add_css_class("success");
  }
  log("loaded state");
}
