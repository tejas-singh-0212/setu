// Setu — overlay helpers + conventions (loaded on every screen)
// Markup: <div class="overlay" id="confirm-apply"> <div class="overlay-card">…</div> </div>
// Open:   openOverlay('confirm-apply')  or  <button data-overlay="confirm-apply">
// Close:  closeOverlay('confirm-apply') or  <button data-overlay-close>

function openOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
}

function closeAllOverlays() {
  document
    .querySelectorAll(".overlay.open")
    .forEach((el) => el.classList.remove("open"));
}

document.addEventListener("click", (e) => {
  // data-overlay="id" → open
  const opener = e.target.closest("[data-overlay]");
  if (opener) {
    openOverlay(opener.getAttribute("data-overlay"));
    return;
  }
  // data-overlay-close → close nearest overlay
  const closer = e.target.closest("[data-overlay-close]");
  if (closer) {
    const overlay = closer.closest(".overlay");
    if (overlay) overlay.classList.remove("open");
    return;
  }
  // click on backdrop (the .overlay itself) → close
  if (e.target.classList && e.target.classList.contains("overlay")) {
    e.target.classList.remove("open");
  }
});

// Esc → close all overlays
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllOverlays();
});
