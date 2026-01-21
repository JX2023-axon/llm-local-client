const state = {
  chats: [],
  models: [],
  activeChatId: null,
  activeModel: null,
  pending: false,
};

const chatList = document.getElementById("chatList");
const messagesEl = document.getElementById("messages");
const chatTitleEl = document.getElementById("chatTitle");
const modelSelect = document.getElementById("modelSelect");
const modelList = document.getElementById("modelList");
const modelNameInput = document.getElementById("modelNameInput");
const messageInput = document.getElementById("messageInput");

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

    item.appendChild(title);
    item.appendChild(meta);
    chatList.appendChild(item);
  });
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
  renderChats();
  if (!state.activeChatId && state.chats.length) {
    selectChat(state.chats[0].id);
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

modelSelect.addEventListener("change", (event) => {
  state.activeModel = event.target.value;
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

document.getElementById("newChatBtn").addEventListener("click", createChat);
document.getElementById("addModelBtn").addEventListener("click", addModel);
document.getElementById("sendBtn").addEventListener("click", sendMessage);

(async function init() {
  await loadModels();
  await loadChats();
})();
