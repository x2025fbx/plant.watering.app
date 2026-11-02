(function () {
  "use strict";

  const storageKey = "leaflinePlants";
  const storage = {
    get: function (key, fallback) {
      try {
        const saved = localStorage.getItem(key);
        return saved === null ? fallback : JSON.parse(saved);
      } catch (error) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        // The dashboard still works for this visit if browser storage is unavailable.
      }
    }
  };

  function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function shiftDate(dateString, days) {
    const parts = dateString.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() + days);
    return toDateString(date);
  }

  function dateDifference(fromDate, toDate) {
    const from = fromDate.split("-").map(Number);
    const to = toDate.split("-").map(Number);
    const fromUtc = Date.UTC(from[0], from[1] - 1, from[2]);
    const toUtc = Date.UTC(to[0], to[1] - 1, to[2]);
    return Math.round((toUtc - fromUtc) / 86400000);
  }

  function readableDate(dateString) {
    const parts = dateString.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }

  function createSamples() {
    const today = toDateString(new Date());
    return SAMPLE_PLANTS.map(function (sample, index) {
      return {
        id: "sample-" + index,
        name: sample.name,
        room: sample.room,
        intervalDays: sample.intervalDays,
        lastWatered: shiftDate(today, -sample.daysSinceWatered),
        priority: sample.priority,
        snoozedUntil: null
      };
    });
  }

  let plants = storage.get(storageKey, null);
  if (!Array.isArray(plants)) {
    plants = createSamples();
  }

  const today = toDateString(new Date());
  const list = document.getElementById("plant-list");
  const searchBox = document.getElementById("search-box");
  const emptyMessage = document.getElementById("empty-message");
  const dialog = document.getElementById("plant-dialog");
  const form = document.getElementById("plant-form");
  const activeFilters = document.querySelectorAll(".filter-button");
  let activeFilter = "all";

  document.title = STARTUP.name + " | Plant care, on time";
  document.getElementById("brand-name").lastChild.textContent = STARTUP.name;
  document.getElementById("today-label").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  document.getElementById("plant-last-watered").value = today;

  function dueInfo(plant) {
    const dueDate = shiftDate(plant.lastWatered, Number(plant.intervalDays));
    const snoozedUntil = plant.snoozedUntil && plant.snoozedUntil > dueDate
      ? plant.snoozedUntil
      : dueDate;
    const difference = dateDifference(today, snoozedUntil);
    const snoozed = snoozedUntil > dueDate && snoozedUntil > today;
    let label;
    let tone;

    if (difference < 0) {
      label = "Overdue by " + Math.abs(difference) + (Math.abs(difference) === 1 ? " day" : " days");
      tone = "overdue";
    } else if (difference === 0) {
      label = "Water today";
      tone = "due";
    } else if (snoozed) {
      label = "Snoozed until " + readableDate(snoozedUntil);
      tone = "upcoming";
    } else if (difference === 1) {
      label = "Due tomorrow";
      tone = "upcoming";
    } else {
      label = "Due in " + difference + " days";
      tone = "upcoming";
    }

    return {
      dueDate: dueDate,
      effectiveDate: snoozedUntil,
      isDue: difference <= 0,
      isOverdue: difference < 0,
      label: label,
      tone: tone
    };
  }

  function savePlants() {
    storage.set(storageKey, plants);
  }

  function makeButton(label, className, action, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    if (title) {
      button.title = title;
      button.setAttribute("aria-label", title);
    }
    button.addEventListener("click", action);
    return button;
  }

  function makePlantRow(plant) {
    const info = dueInfo(plant);
    const row = document.createElement("article");
    row.className = "plant-row " + info.tone;

    const marker = document.createElement("span");
    marker.className = "plant-marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = plant.name.charAt(0).toUpperCase();

    const identity = document.createElement("div");
    identity.className = "plant-identity";
    const name = document.createElement("h3");
    name.textContent = plant.name;
    const details = document.createElement("p");
    details.textContent = (plant.room ? plant.room + "  ·  " : "") +
      "Every " + plant.intervalDays + " days  ·  Last watered " + readableDate(plant.lastWatered);
    identity.append(name, details);
    if (plant.priority) {
      const priority = document.createElement("span");
      priority.className = "priority-pill";
      priority.textContent = "Priority";
      identity.append(priority);
    }

    const due = document.createElement("div");
    due.className = "due-label";
    const dueText = document.createElement("strong");
    dueText.textContent = info.label;
    const dueDate = document.createElement("span");
    dueDate.textContent = info.tone === "upcoming" && info.effectiveDate !== info.dueDate
      ? "Original date " + readableDate(info.dueDate)
      : "Next: " + readableDate(info.effectiveDate);
    due.append(dueText, dueDate);

    const actions = document.createElement("div");
    actions.className = "plant-actions";
    actions.append(makeButton("Mark watered", "button row-primary", function () {
      plant.lastWatered = today;
      plant.snoozedUntil = null;
      savePlants();
      renderPlants();
    }));
    if (info.isDue) {
      actions.append(makeButton("Snooze 1 day", "text-button", function () {
        plant.snoozedUntil = shiftDate(today, 1);
        savePlants();
        renderPlants();
      }));
    }
    actions.append(
      makeButton(plant.priority ? "Unpin" : "Prioritize", "text-button priority-button", function () {
        plant.priority = !plant.priority;
        savePlants();
        renderPlants();
      }),
      makeButton("×", "icon-button remove-button", function () {
        if (window.confirm("Remove " + plant.name + " from your plants?")) {
          plants = plants.filter(function (item) { return item.id !== plant.id; });
          savePlants();
          renderPlants();
        }
      }, "Remove " + plant.name)
    );

    row.append(marker, identity, due, actions);
    return row;
  }

  function matchesFilter(plant) {
    const info = dueInfo(plant);
    if (activeFilter === "needs-water") {
      return info.isDue;
    }
    if (activeFilter === "upcoming") {
      return !info.isDue;
    }
    return true;
  }

  function renderPlants() {
    const query = searchBox.value.trim().toLowerCase();
    const ordered = plants.slice().sort(function (first, second) {
      const firstInfo = dueInfo(first);
      const secondInfo = dueInfo(second);
      if (firstInfo.isDue !== secondInfo.isDue) {
        return firstInfo.isDue ? -1 : 1;
      }
      if (first.priority !== second.priority) {
        return first.priority ? -1 : 1;
      }
      return firstInfo.effectiveDate.localeCompare(secondInfo.effectiveDate);
    });
    const visible = ordered.filter(function (plant) {
      const searchable = (plant.name + " " + (plant.room || "")).toLowerCase();
      return matchesFilter(plant) && searchable.indexOf(query) !== -1;
    });
    const dueCount = plants.filter(function (plant) { return dueInfo(plant).isDue; }).length;
    const overdueCount = plants.filter(function (plant) { return dueInfo(plant).isOverdue; }).length;

    document.getElementById("needs-water-count").textContent = dueCount;
    document.getElementById("overdue-count").textContent = overdueCount;
    document.getElementById("plant-count").textContent = plants.length;
    document.getElementById("filter-due-count").textContent = dueCount;
    list.replaceChildren.apply(list, visible.map(makePlantRow));
    emptyMessage.hidden = visible.length > 0;
    if (plants.length === 0) {
      emptyMessage.querySelector("h3").textContent = "No plants here yet";
      emptyMessage.querySelector("p").textContent = "Add a plant to start building your watering routine.";
      document.getElementById("empty-add-button").hidden = false;
    } else {
      emptyMessage.querySelector("h3").textContent = "No plants match";
      emptyMessage.querySelector("p").textContent = "Try another search or choose a different filter.";
      document.getElementById("empty-add-button").hidden = true;
    }
  }

  function openDialog() {
    form.reset();
    document.getElementById("plant-last-watered").value = today;
    dialog.showModal();
    document.getElementById("plant-name").focus();
  }

  document.getElementById("add-plant-button").addEventListener("click", openDialog);
  document.getElementById("empty-add-button").addEventListener("click", openDialog);
  document.getElementById("close-dialog").addEventListener("click", function () { dialog.close(); });
  document.getElementById("cancel-dialog").addEventListener("click", function () { dialog.close(); });
  searchBox.addEventListener("input", renderPlants);

  activeFilters.forEach(function (button) {
    button.addEventListener("click", function () {
      activeFilter = button.dataset.filter;
      activeFilters.forEach(function (filterButton) {
        filterButton.setAttribute("aria-pressed", filterButton === button ? "true" : "false");
      });
      renderPlants();
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const values = new FormData(form);
    plants.push({
      id: "plant-" + Date.now(),
      name: String(values.get("name")).trim(),
      room: String(values.get("room")).trim(),
      intervalDays: Number(values.get("intervalDays")),
      lastWatered: String(values.get("lastWatered")),
      priority: values.get("priority") === "on",
      snoozedUntil: null
    });
    savePlants();
    form.reset();
    dialog.close();
    activeFilter = "all";
    activeFilters.forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.filter === "all" ? "true" : "false");
    });
    searchBox.value = "";
    renderPlants();
  });

  renderPlants();
})();