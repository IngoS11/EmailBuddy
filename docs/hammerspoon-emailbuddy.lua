-- EmailBuddy global rewrite hotkey for Hammerspoon.
-- Binds Cmd+Shift+E, rewrites selected text via EmailBuddy Companion,
-- and replaces the current selection in the focused UI element.

local EMAILBUDDY_URL = "http://127.0.0.1:48123/v1/rewrite"
local EMAILBUDDY_MODE = "polished"
local EMAILBUDDY_TIMEOUT_SECONDS = 12

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

  return system:attributeValue("AXFocusedUIElement")
end

local function selectedText(el)
  if not el then
    return nil
  end

  local text = el:attributeValue("AXSelectedText")
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

  return el:setAttributeValue("AXSelectedText", text) == true
end

local function rewriteSelectedText()
  local el = focusedElement()
  local source = selectedText(el)

  if not source then
    notify("No selected text found in focused app.", true)
    return
  end

  hs.http.asyncPost(
    EMAILBUDDY_URL,
    hs.json.encode({
      text = source,
      mode = EMAILBUDDY_MODE
    }),
    { ["Content-Type"] = "application/json" },
    function(status, body)
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

      if not replaceSelectedText(el, rewritten) then
        notify("Focused app does not allow AX text replacement.", true)
        return
      end

      local provider = decoded.providerUsed or "provider"
      notify("Rewritten via " .. provider .. ".")
    end
  )
end

hs.http.timeout(EMAILBUDDY_TIMEOUT_SECONDS)
hs.hotkey.bind({ "cmd", "shift" }, "E", rewriteSelectedText)
