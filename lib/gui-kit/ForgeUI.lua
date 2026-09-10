-- Forge UI: client-only building blocks. Copy into your existing source mapping.
local TweenService = game:GetService("TweenService")
local UI = {}
UI.Theme = {
    background = Color3.fromRGB(23, 27, 38),
    surface = Color3.fromRGB(36, 43, 59),
    accent = Color3.fromRGB(62, 94, 188),
    text = Color3.fromRGB(255, 255, 255),
    muted = Color3.fromRGB(57, 64, 80),
    success = Color3.fromRGB(29, 103, 71),
    error = Color3.fromRGB(156, 43, 56),
}
local function make(className, properties, parent)
    local instance = Instance.new(className)
    for key, value in pairs(properties) do instance[key] = value end
    instance.Parent = parent
    return instance
end
local function corner(parent)
    make("UICorner", { CornerRadius = UDim.new(0, 10) }, parent)
end

function UI.button(parent, options)
    options = options or {}
    local theme = options.theme or UI.Theme
    local root = make("Frame", { Name = options.name or "Action", BackgroundTransparency = 1,
        Size = UDim2.new(1, 0, 0, 48), LayoutOrder = options.order or 0 }, parent)
    local button = make("TextButton", { Name = "Button", AnchorPoint = Vector2.new(0.5, 0.5),
        Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromScale(1, 1), BorderSizePixel = 0,
        Text = options.text or "Continuer", TextSize = 18, TextWrapped = true,
        Font = Enum.Font.GothamMedium, TextColor3 = theme.text, BackgroundColor3 = theme.accent,
        AutoButtonColor = false, Selectable = true }, root)
    corner(button)
    local scale = make("UIScale", { Scale = 1 }, button)
    local states = { normal = true, loading = true, disabled = true, success = true, error = true }
    local state, disposed, hovered, focused, running = "normal", false, false, false, false
    local connections, tween = {}, nil
    local controller = { root = root, button = button }
    local function animate()
        if disposed then return end
        if tween then tween:Cancel() end
        local interactive = state ~= "disabled" and state ~= "loading" and not running
        tween = TweenService:Create(scale, TweenInfo.new(0.12), { Scale = interactive and (hovered or focused) and 1.025 or 1 })
        tween:Play()
    end
    function controller:setState(nextState, label)
        assert(states[nextState], "Etat de bouton inconnu")
        if disposed then return end
        state = nextState
        button.Active = state ~= "disabled" and state ~= "loading"
        button.Selectable = button.Active
        button.Text = label or (state == "loading" and "Chargement…" or options.text or "Continuer")
        button.BackgroundColor3 = (state == "disabled" or state == "loading") and theme.muted
            or state == "success" and theme.success or state == "error" and theme.error or theme.accent
        animate()
    end
    function controller:activate()
        if disposed or running or state == "disabled" or state == "loading" then return false end
        if not options.onActivated then return false end
        running = true
        self:setState("loading")
        local ok, err = pcall(options.onActivated, self)
        running = false
        if not disposed and state == "loading" then self:setState(ok and "normal" or "error", ok and nil or "Réessayer") end
        if not ok then warn("ForgeUI action: " .. tostring(err)) end
        return ok
    end
    local function connect(signal, callback) table.insert(connections, signal:Connect(callback)) end
    connect(button.Activated, function() controller:activate() end)
    connect(button.MouseEnter, function() hovered = true; animate() end)
    connect(button.MouseLeave, function() hovered = false; animate() end)
    connect(button.SelectionGained, function() focused = true; animate() end)
    connect(button.SelectionLost, function() focused = false; animate() end)
    local function cleanup()
        if disposed then return end
        disposed = true
        if tween then tween:Cancel() end
        for _, connection in ipairs(connections) do connection:Disconnect() end
        table.clear(connections)
    end
    connect(root.Destroying, cleanup)
    function controller:destroy() cleanup(); root:Destroy() end
    controller:setState(options.state or "normal")
    return controller
end

function UI.window(parent, options)
    options = options or {}
    local theme = options.theme or UI.Theme
    local root = make("Frame", { Name = options.name or "Window", AnchorPoint = Vector2.new(0.5, 0.5),
        Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromScale(0.9, 0.8),
        BackgroundColor3 = theme.background, BorderSizePixel = 0, Visible = options.visible ~= false }, parent)
    corner(root)
    make("UISizeConstraint", { MaxSize = Vector2.new(640, 480) }, root)
    make("TextLabel", { Name = "Title", BackgroundTransparency = 1, Position = UDim2.fromOffset(16, 8),
        Size = UDim2.new(1, -84, 0, 44), Font = Enum.Font.GothamBold, TextSize = 22,
        TextColor3 = theme.text, TextXAlignment = Enum.TextXAlignment.Left,
        TextTruncate = Enum.TextTruncate.AtEnd, Text = options.title or "Menu" }, root)
    local body = make("ScrollingFrame", { Name = "Body", BackgroundTransparency = 1, BorderSizePixel = 0,
        Position = UDim2.fromOffset(16, 72), Size = UDim2.new(1, -32, 1, -88), ScrollBarThickness = 4,
        CanvasSize = UDim2.fromOffset(0, 0), AutomaticCanvasSize = Enum.AutomaticSize.Y,
        ScrollingDirection = Enum.ScrollingDirection.Y }, root)
    make("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8),
        PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8) }, body)
    make("UIListLayout", { Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder }, body)
    local close = UI.button(root, { text = "×", theme = theme, name = "Close",
        onActivated = function() root.Visible = false end })
    close.root.Position = UDim2.new(1, -60, 0, 8)
    close.root.Size = UDim2.fromOffset(44, 44)
    return { root = root, body = body, close = close, destroy = function() root:Destroy() end }
end
return UI
