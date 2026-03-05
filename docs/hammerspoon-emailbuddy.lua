-- EmailBuddy global rewrite hotkey for Hammerspoon.
-- Binds Cmd+Shift+E, rewrites selected text via EmailBuddy Companion,
-- and replaces the current selection in the focused UI element.

local EMAILBUDDY_URL = "http://127.0.0.1:48123/v1/rewrite"
local EMAILBUDDY_MODE = "casual"
local EMAILBUDDY_TIMEOUT_SECONDS = 12

local function getAttribute(el, name)
  if not el or type(el.attributeValue) ~= "function" then
    return nil
  end

  local ok, value = pcall(el.attributeValue, el, name)
  if not ok then
    return nil
  end

  return value
end

local function setAttribute(el, name, value)
  if not el or type(el.setAttributeValue) ~= "function" then
    return false
  end

  local ok, changed = pcall(el.setAttributeValue, el, name, value)
  return ok and changed == true
end

local function restoreClipboard(previous)
  if previous == nil then
    hs.pasteboard.clearContents()
    return
  end

  hs.pasteboard.setContents(previous)
end

local function selectedTextFromClipboard()
  local before = hs.pasteboard.getContents()
  local beforeCount = hs.pasteboard.changeCount()

  hs.eventtap.keyStroke({ "cmd" }, "c", 0)

  local copied = nil
  for _ = 1, 25 do
    hs.timer.usleep(10000)
    local current = hs.pasteboard.getContents()
    local currentCount = hs.pasteboard.changeCount()
    if type(current) == "string" and current:match("%S") and (currentCount ~= beforeCount or current ~= before) then
      copied = current
      break
    end
  end

  restoreClipboard(before)
  return copied
end

local function pasteTextWithClipboard(text)
  local before = hs.pasteboard.getContents()
  hs.pasteboard.setContents(text)
  hs.eventtap.keyStroke({ "cmd" }, "v", 0)
  hs.timer.usleep(50000)
  restoreClipboard(before)
  return true
end

local function notify(message, isError)
  hs.notify.new({
    title = "EmailBuddy",
    informativeText = message,
    withdrawAfter = isError and 4 or 2
  }):send()
end

local function focusedElement()
  local el = hs.uielement.focusedElement()
  if el then
    return el
  end

  local system = hs.uielement.systemWideElement()
  if not system then
    return nil
  end

  return getAttribute(system, "AXFocusedUIElement")
end

local function selectedText(el)
  if not el then
    return nil
  end

  local text = getAttribute(el, "AXSelectedText")
  if type(text) ~= "string" then
    return nil
  end

  if text:match("%S") then
    return text
  end

  return nil
end

local function replaceSelectedText(el, text)
  if not el then
    return false
  end

  return setAttribute(el, "AXSelectedText", text)
end

local function rewriteSelectedText()
  local el = focusedElement()
  local source = selectedText(el)
  local usedClipboardFallback = false

  if not source then
    source = selectedTextFromClipboard()
    if source then
      usedClipboardFallback = true
    end
  end

  if not source then
    notify("No selected text found in focused app.", true)
    return
  end

  local requestDone = false
  local timeoutTimer = hs.timer.doAfter(EMAILBUDDY_TIMEOUT_SECONDS, function()
    if requestDone then
      return
    end

    requestDone = true
    notify("Rewrite timed out after " .. tostring(EMAILBUDDY_TIMEOUT_SECONDS) .. " seconds.", true)
  end)

  hs.http.asyncPost(
    EMAILBUDDY_URL,
    hs.json.encode({
      text = source,
      mode = EMAILBUDDY_MODE
    }),
    { ["Content-Type"] = "application/json" },
    function(status, body)
      if requestDone then
        return
      end

      requestDone = true
      if timeoutTimer then
        timeoutTimer:stop()
      end

      if status ~= 200 then
        notify("Rewrite failed (HTTP " .. tostring(status) .. ").", true)
        return
      end

      local decoded = hs.json.decode(body or "")
      local rewritten = decoded and decoded.rewrittenText
      if type(rewritten) ~= "string" or rewritten == "" then
        notify("Rewrite failed: invalid companion response.", true)
        return
      end

      if replaceSelectedText(el, rewritten) then
        local provider = decoded.providerUsed or "provider"
        notify("Rewritten via " .. provider .. ".")
        return
      end

      if usedClipboardFallback and pasteTextWithClipboard(rewritten) then
        local provider = decoded.providerUsed or "provider"
        notify("Rewritten via " .. provider .. ".")
        return
      end

      notify("Focused app does not allow AX text replacement.", true)
    end
  )
end

hs.hotkey.bind({ "cmd", "shift" }, "E", rewriteSelectedText)
