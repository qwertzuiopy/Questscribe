
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
