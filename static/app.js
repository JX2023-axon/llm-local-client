const state = {
  chats: [],
  models: [],
  activeChatId: null,
  activeModel: null,
  pending: false,
  archivedChats: [],
};

let chatList, archivedList, messagesEl, chatTitleEl, modelSelect, modelList, modelNameInput, messageInput;

function initDOM() {
  chatList = document.getElementById("chatList");
  archivedList = document.getElementById("archivedList");
  messagesEl = document.getElementById("messages");
  chatTitleEl = document.getElementById("chatTitle");
  modelSelect = document.getElementById("modelSelect");
  modelList = document.getElementById("modelList");
  modelNameInput = document.getElementById("modelNameInput");
  messageInput = document.getElementById("messageInput");
  
  // Attach event listeners now that DOM is ready
  attachEventListeners();
}

if (window.marked) {
  marked.setOptions({ breaks: true, gfm: true });
}

function renderMath(container) {
  if (!window.renderMathInElement) return;
  renderMathInElement(container, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
  });
}

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

function renderChats() {
  chatList.innerHTML = "";
  state.chats.forEach((chat) => {
    const item = document.createElement("div");
    item.className = "chat-item" + (chat.id === state.activeChatId ? " active" : "");
    item.addEventListener("click", () => selectChat(chat.id));

    const title = document.createElement("div");
    title.className = "chat-item-title";
    title.textContent = chat.title;

    const meta = document.createElement("div");
    meta.className = "chat-item-meta";
    meta.textContent = formatTime(chat.updated_at);

    const actions = document.createElement("div");
    actions.className = "chat-item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "ghost small";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renameChat(chat.id, chat.title);
    });

    const archiveBtn = document.createElement("button");
    archiveBtn.className = "ghost small";
    archiveBtn.textContent = "Archive";
    archiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      archiveChat(chat.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost small delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(archiveBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(actions);
    chatList.appendChild(item);
  });
}

function renderArchived() {
  if (!archivedList) return;
  archivedList.innerHTML = "";
  state.archivedChats.forEach((chat) => {
    const item = document.createElement("div");
    item.className = "chat-item";

    const title = document.createElement("div");
    title.className = "chat-item-title";
    title.textContent = chat.title;

    const meta = document.createElement("div");
    meta.className = "chat-item-meta";
    meta.textContent = formatTime(chat.updated_at);

    const actions = document.createElement("div");
    actions.className = "chat-item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "ghost small";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renameChat(chat.id, chat.title);
    });

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "ghost small";
    restoreBtn.textContent = "Restore";
    restoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      restoreChat(chat.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost small delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(actions);
    archivedList.appendChild(item);
  });
}

async function renameChat(chatId, currentTitle) {
  const title = prompt("Rename chat", currentTitle || "");
  if (!title || title.trim() === currentTitle) return;
  try {
    const data = await api(`/api/chats/${chatId}/title`, {
      method: "PUT",
      body: JSON.stringify({ title: title.trim() }),
    });
    // Update state and UI
    await loadChats();
    if (state.activeChatId === chatId) {
      chatTitleEl.textContent = data.chat.title;
    }
  } catch (err) {
    alert("Failed to rename chat: " + err.message);
  }
}


function renderModels() {
  modelList.innerHTML = "";
  modelSelect.innerHTML = "";
  state.models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.name;
    option.textContent = model.name;
    modelSelect.appendChild(option);

    const row = document.createElement("div");
    row.className = "model-row";
    const name = document.createElement("span");
    name.textContent = model.name;

    const actions = document.createElement("div");
    actions.className = "model-actions";

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => editModel(model));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteModel(model.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(name);
    row.appendChild(actions);
    modelList.appendChild(row);
  });

  if (!state.activeModel && state.models.length) {
    state.activeModel = state.models[0].name;
  }
  if (state.activeModel) {
    modelSelect.value = state.activeModel;
  }
}

function renderMessages(messages) {
  messagesEl.innerHTML = "";
  messages.forEach((msg) => {
    messagesEl.appendChild(buildMessage(msg.role, msg.content));
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function buildMessage(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = role === "user" ? "You" : "Gemini";

  const body = document.createElement("div");
  body.className = "message-content";
  if (window.marked) {
    body.innerHTML = marked.parse(content || "");
    renderMath(body);
  } else {
    body.textContent = content;
  }

  wrapper.appendChild(label);
  wrapper.appendChild(body);
  return wrapper;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

async function loadModels() {
  const data = await api("/api/models");
  state.models = data.models;
  renderModels();
}

async function loadChats() {
  const data = await api("/api/chats");
  state.chats = data.chats;
  
  // Load archived chats
  const archivedData = await api("/api/chats/archived/list");
  state.archivedChats = archivedData.chats;
  
  renderChats();
  renderArchived();
  if (!state.activeChatId && state.chats.length) {
    selectChat(state.chats[0].id);
  }
}

async function archiveChat(chatId) {
  if (!confirm("Archive this chat?")) return;
  try {
    await api(`/api/chats/${chatId}/archive`, { method: "PUT" });
    if (state.activeChatId === chatId) {
      state.activeChatId = null;
      renderMessages([]);
    }
    await loadChats();
  } catch (err) {
    alert("Failed to archive chat: " + err.message);
  }
}

async function restoreChat(chatId) {
  try {
    await api(`/api/chats/${chatId}/restore`, { method: "PUT" });
    await loadChats();
  } catch (err) {
    alert("Failed to restore chat: " + err.message);
  }
}

async function deleteChat(chatId) {
  if (!confirm("Delete this chat permanently?")) return;
  try {
    await api(`/api/chats/${chatId}`, { method: "DELETE" });
    if (state.activeChatId === chatId) {
      state.activeChatId = null;
      renderMessages([]);
    }
    await loadChats();
  } catch (err) {
    alert("Failed to delete chat: " + err.message);
  }
}

async function selectChat(chatId) {
  state.activeChatId = chatId;
  const data = await api(`/api/chats/${chatId}`);
  chatTitleEl.textContent = data.chat.title;
  renderMessages(data.messages);
  renderChats();
  if (data.chat.last_model) {
    state.activeModel = data.chat.last_model;
    modelSelect.value = data.chat.last_model;
  }
}

async function createChat() {
  const data = await api("/api/chats", { method: "POST" });
  state.chats.unshift(data.chat);
  state.activeChatId = data.chat.id;
  chatTitleEl.textContent = data.chat.title;
  renderChats();
  renderMessages([]);
}

async function addModel() {
  const name = modelNameInput.value.trim();
  if (!name) return;
  const data = await api("/api/models", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  state.models.push(data.model);
  modelNameInput.value = "";
  renderModels();
}

async function editModel(model) {
  const name = prompt("Rename model", model.name);
  if (!name || name.trim() === model.name) return;
  const data = await api(`/api/models/${model.id}`, {
    method: "PUT",
    body: JSON.stringify({ name: name.trim() }),
  });
  const idx = state.models.findIndex((m) => m.id === model.id);
  if (idx >= 0) {
    state.models[idx].name = data.model.name;
  }
  if (state.activeModel === model.name) {
    state.activeModel = data.model.name;
  }
  renderModels();
}

async function deleteModel(modelId) {
  if (!confirm("Delete this model?") ) return;
  await api(`/api/models/${modelId}`, { method: "DELETE" });
  state.models = state.models.filter((m) => m.id !== modelId);
  if (state.activeModel && !state.models.find((m) => m.name === state.activeModel)) {
    state.activeModel = state.models[0] ? state.models[0].name : null;
  }
  renderModels();
}

async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || state.pending) return;
  if (!state.activeChatId) {
    await createChat();
  }

  state.pending = true;
  messageInput.value = "";
  const userMessage = buildMessage("user", content);
  messagesEl.appendChild(userMessage);

  const thinking = buildMessage("model", "Thinking...");
  messagesEl.appendChild(thinking);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const data = await api(`/api/chats/${state.activeChatId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        model_name: state.activeModel || modelSelect.value,
      }),
    });
    thinking.replaceWith(buildMessage("model", data.message.content));
    chatTitleEl.textContent = data.chat.title;
    const chatIndex = state.chats.findIndex((c) => c.id === data.chat.id);
    if (chatIndex >= 0) {
      state.chats[chatIndex] = data.chat;
      state.chats.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    }
    renderChats();
  } catch (err) {
    thinking.replaceWith(buildMessage("model", "Error: " + err.message));
  } finally {
    state.pending = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function attachEventListeners() {
  if (modelSelect) {
    modelSelect.addEventListener("change", (event) => {
      state.activeModel = event.target.value;
    });
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
  }
  // no manage panel listeners

  const newChatBtn = document.getElementById("newChatBtn");
  const addModelBtn = document.getElementById("addModelBtn");
  const sendBtn = document.getElementById("sendBtn");

  if (newChatBtn) newChatBtn.addEventListener("click", createChat);
  if (addModelBtn) addModelBtn.addEventListener("click", addModel);
  if (sendBtn) sendBtn.addEventListener("click", sendMessage);
}

(async function init() {
  console.log("=== App initializing ===");
  initDOM();
  console.log("=== DOM initialized ===");
  await loadModels();
  console.log("=== Models loaded ===");
  await loadChats();
  console.log("=== Chats loaded ===");
})();
