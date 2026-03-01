(function () {
  console.log("[ARH] aspectRatioController.js loaded");

  const _OFF = "Off";
  const _LOCK = "🔒";
  const _IMAGE = "🖼️";

  const DEFAULT_RATIOS = ["1:1", "4:3", "3:2", "5:4", "16:9", "9:16", "21:9"];

  const _MAXIMUM_DIMENSION = 2048;
  const _MINIMUM_DIMENSION = 64;

  const _IMAGE_INPUT_CONTAINER_IDS = [
    "img2img_image",
    "img2img_sketch",
    "img2maskimg",
    "inpaint_sketch",
    "img_inpaint_base",
  ];

  const roundToClosestMultiple = (num, multiple) =>
    Math.round(Number(num) / multiple) * multiple;

  const aspectRatioFromStr = (ar) => {
    if (!ar || !ar.includes(":")) return null;
    return ar.split(":").map((x) => Number(x));
  };

  const reverseAspectRatio = (ar) => {
    if (!ar || !ar.includes(":")) return null;
    const [w, h] = ar.split(":");
    return `${h}:${w}`;
  };

  const clampToBoundaries = (width, height) => {
    const ar = width / height;

    width = Math.max(Math.min(width, _MAXIMUM_DIMENSION), _MINIMUM_DIMENSION);
    height = Math.max(Math.min(height, _MAXIMUM_DIMENSION), _MINIMUM_DIMENSION);

    if (width / height > ar) height = Math.round(width / ar);
    else if (width / height < ar) width = Math.round(height * ar);

    width = Math.max(Math.min(width, _MAXIMUM_DIMENSION), _MINIMUM_DIMENSION);
    height = Math.max(Math.min(height, _MAXIMUM_DIMENSION), _MINIMUM_DIMENSION);

    return [width, height];
  };

  const reverseAllOptions = () => {
    const list = Array.from(gradioApp().querySelectorAll(".ar-option"));
    list.forEach((el) => {
      const rev = reverseAspectRatio(el.value);
      if (rev) {
        el.value = rev;
        el.textContent = rev;
      }
    });
  };

  const getSelectedImage2ImageTab = () => {
    const mode = gradioApp().getElementById("mode_img2img");
    if (!mode) return 0;
    const selected = mode.querySelector("button.selected");
    const all = mode.querySelectorAll("button");
    const idx = Array.prototype.indexOf.call(all, selected);
    return idx < 0 ? 0 : idx;
  };

  const getCurrentImage = () => {
    const idx = getSelectedImage2ImageTab();
    const id = _IMAGE_INPUT_CONTAINER_IDS[idx];
    return gradioApp().getElementById(id)?.querySelector("img");
  };

  const findWidthHeightContainers = (page) => {
    // These exist in Forge Neo too
    const w = gradioApp().querySelector(`#${page}_width`);
    const h = gradioApp().querySelector(`#${page}_height`);
    return { w, h };
  };

  const findResSwitchButton = (page) => {
    return (
      gradioApp().getElementById(page + "_res_switch_btn") ||
      gradioApp().querySelector(`#${page}_res_switch_btn`) ||
      gradioApp().querySelector(`button[id="${page}_res_switch_btn"]`) ||
      gradioApp().querySelector(`*[id="${page}_res_switch_btn"]`)
    );
  };

  class OptionPickingController {
    constructor(page, options, controller) {
      this.page = page;
      this.options = options;

      this.switchButton = findResSwitchButton(page);
      if (!this.switchButton) {
        console.warn(`[ARH] Cannot find ${page}_res_switch_btn — JS control not injected.`);
        return;
      }

      // Create wrapper and dropdown
      const wrapper = document.createElement("div");
      wrapper.id = `${this.page}_size_toolbox`;
      wrapper.className = "flex flex-col items-center gap-2";

      const selectWrap = document.createElement("div");
      selectWrap.id = `${this.page}_ratio`;
      selectWrap.className =
        "gr-block gr-box relative w-full border-solid border border-gray-200 gr-padded";

      const sel = document.createElement("select");
      sel.id = `${this.page}_select_aspect_ratio`;
      sel.className = "gr-box gr-input w-full disabled:cursor-not-allowed";

      sel.innerHTML = this.options
        .map((r) => `<option class="ar-option">${r}</option>`)
        .join("\n");

      selectWrap.appendChild(sel);

      wrapper.appendChild(selectWrap);

      const parent = this.switchButton.parentNode;
      if (!parent) {
        console.warn(`[ARH] ${page}_res_switch_btn has no parent — skip injection.`);
        return;
      }

      parent.removeChild(this.switchButton);
      wrapper.appendChild(this.switchButton);
      parent.appendChild(wrapper);

      sel.onchange = () => controller.setAspectRatio(this.getCurrentOption());
      this.switchButton.onclick = () => {
        reverseAllOptions();
        const picked = this.getCurrentOption();
        if (_LOCK === picked) controller.setAspectRatio(`${controller.heightRatio}:${controller.widthRatio}`);
        else controller.setAspectRatio(picked);
      };

      console.log(`[ARH] Injected JS picker for ${page}`);
    }

    getCurrentOption() {
      const sel = gradioApp().getElementById(`${this.page}_select_aspect_ratio`);
      if (!sel) return _OFF;
      const options = Array.from(sel);
      return options[sel.selectedIndex]?.value ?? _OFF;
    }
  }

  class SliderController {
    constructor(element) {
      this.element = element;
      this.numberInput = this.element.querySelector('input[type=number]');
      this.rangeInput = this.element.querySelector('input[type=range]');
      this.inputs = [this.numberInput, this.rangeInput].filter(Boolean);
      this.inputs.forEach((input) => (input.isWidth = element.isWidth));
    }
    getVal() { return Number(this.numberInput?.value ?? 0); }
    updateVal(v) { this.inputs.forEach((i) => (i.value = Number(v))); }
    updateMin(v) { this.inputs.forEach((i) => (i.min = roundToClosestMultiple(Number(v), 8))); }
    updateMax(v) { this.inputs.forEach((i) => (i.max = roundToClosestMultiple(Number(v), 8))); }
    triggerEvent(ev) { this.numberInput?.dispatchEvent(ev); }
    setVal(v) { this.updateVal(roundToClosestMultiple(Number(v), 8)); }
  }

  class AspectRatioController {
    constructor(page, widthContainer, heightContainer, options) {
      widthContainer.isWidth = true;
      heightContainer.isWidth = false;

      this.widthContainer = new SliderController(widthContainer);
      this.heightContainer = new SliderController(heightContainer);

      this.inputs = [...this.widthContainer.inputs, ...this.heightContainer.inputs];
      this.inputs.forEach((input) => {
        input.addEventListener("change", (e) => {
          e.preventDefault();
          this.maintainAspectRatio(input);
        });
      });

      this.optionPickingControler = new OptionPickingController(page, options, this);
      this.setAspectRatio(_OFF);
    }

    disable() {
      this.widthContainer.updateMin(_MINIMUM_DIMENSION);
      this.heightContainer.updateMin(_MINIMUM_DIMENSION);
      this.widthContainer.updateMax(_MAXIMUM_DIMENSION);
      this.heightContainer.updateMax(_MAXIMUM_DIMENSION);
    }

    isLandscapeOrSquare() { return this.widthRatio >= this.heightRatio; }

    updateInputStates() {
      if (this.isLandscapeOrSquare()) {
        const AR = this.widthRatio / this.heightRatio;
        const minW = Math.max(Math.round(_MINIMUM_DIMENSION * AR), _MINIMUM_DIMENSION);
        this.widthContainer.updateMin(minW);
        this.heightContainer.updateMin(_MINIMUM_DIMENSION);

        const maxH = Math.min(_MAXIMUM_DIMENSION, Math.round(_MAXIMUM_DIMENSION / AR));
        this.heightContainer.updateMax(maxH);
        this.widthContainer.updateMax(_MAXIMUM_DIMENSION);
      } else {
        const AR = this.heightRatio / this.widthRatio;
        const minH = Math.max(Math.round(_MINIMUM_DIMENSION * AR), _MINIMUM_DIMENSION);
        this.heightContainer.updateMin(minH);
        this.widthContainer.updateMin(_MINIMUM_DIMENSION);

        const maxW = Math.min(_MAXIMUM_DIMENSION, Math.round(_MAXIMUM_DIMENSION / AR));
        this.widthContainer.updateMax(maxW);
        this.heightContainer.updateMax(_MAXIMUM_DIMENSION);
      }
    }

    setAspectRatio(aspectRatio) {
      this.aspectRatio = aspectRatio;
      if (aspectRatio === _OFF) return this.disable();

      let wR, hR;

      if (aspectRatio === _IMAGE) {
        const img = getCurrentImage();
        wR = img?.naturalWidth || 1;
        hR = img?.naturalHeight || 1;
      } else if (aspectRatio === _LOCK) {
        wR = this.widthContainer.getVal();
        hR = this.heightContainer.getVal();
      } else {
        const parsed = aspectRatioFromStr(aspectRatio);
        if (!parsed) return this.disable();
        [wR, hR] = parsed;
      }

      [wR, hR] = clampToBoundaries(wR, hR);
      this.widthRatio = wR;
      this.heightRatio = hR;
      this.updateInputStates();
      this.maintainAspectRatio();
    }

    maintainAspectRatio(changedElement) {
      if (this.aspectRatio === _OFF) return;

      if (!changedElement) {
        const allValues = this.inputs.map((x) => Number(x.value));
        changedElement = { value: Math.max(...allValues) };
      }

      const ar = this.widthRatio / this.heightRatio;
      let w, h;

      if (changedElement.isWidth === undefined) {
        if (this.isLandscapeOrSquare()) { w = Math.round(changedElement.value); h = Math.round(changedElement.value / ar); }
        else { h = Math.round(changedElement.value); w = Math.round(changedElement.value * ar); }
      } else {
        if (changedElement.isWidth) { w = Math.round(changedElement.value); h = Math.round(changedElement.value / ar); }
        else { h = Math.round(changedElement.value); w = Math.round(changedElement.value * ar); }
      }

      const [width, height] = clampToBoundaries(w, h);
      const ev = new Event("input", { bubbles: true });

      this.widthContainer.setVal(width);
      this.widthContainer.triggerEvent(ev);
      this.heightContainer.setVal(height);
      this.heightContainer.triggerEvent(ev);

      if (typeof dimensionChange === "function") {
        this.heightContainer.inputs.forEach((input) => dimensionChange({ target: input }, false, true));
        this.widthContainer.inputs.forEach((input) => dimensionChange({ target: input }, true, false));
      }
    }
  }

  const initWithRetry = (key, page, options) => {
    let tries = 0;
    const maxTries = 60; // 60 * 250ms = 15s

    const tick = () => {
      tries++;

      const { w, h } = findWidthHeightContainers(page);
      if (!w || !h) {
        if (tries === 1 || tries === 10 || tries === 30 || tries === maxTries) {
          console.log(`[ARH] ${page} waiting width/height... (try ${tries}/${maxTries}) w=${!!w} h=${!!h}`);
        }
        if (tries >= maxTries) {
          console.warn(`[ARH] ${page} giving up: width/height not found`);
          clearInterval(timer);
        }
        return;
      }

      if (window[key]) {
        clearInterval(timer);
        return;
      }

      new AspectRatioController(page, w, h, options);

      const sw = findResSwitchButton(page);
      console.log(`[ARH] ${page} init done. res_switch_btn=${!!sw}`);
      window[key] = true;
      clearInterval(timer);
    };

    const timer = setInterval(tick, 250);
    tick();
  };

  const run = () => {
    console.log("[ARH] init start");

    const txt2imgOptions = [_OFF, _LOCK, ...DEFAULT_RATIOS];
    const img2imgOptions = [_OFF, _LOCK, _IMAGE, ...DEFAULT_RATIOS];

    initWithRetry("__txt2imgAspectRatioController", "txt2img", txt2imgOptions);
    initWithRetry("__img2imgAspectRatioController", "img2img", img2imgOptions);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
