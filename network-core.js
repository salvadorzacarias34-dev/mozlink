let isSignUpMode = false;
let currentUser = null;

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('authTitle').innerText = isSignUpMode ? "Criar Nova Conta" : "Entrar no Mozlink";
    document.getElementById('btnAuthAction').innerText = isSignUpMode ? "Registar" : "Entrar";
    document.getElementById('authToggle').innerText = isSignUpMode ? "Já tem conta? Faça Login" : "Não tem conta? Registe-se aqui";
}

// Monitorizar se o utilizador está logado ou não
window.addEventListener('DOMContentLoaded', () => {
    const checkAuthInterval = setInterval(() => {
        if (window.authEnv) {
            clearInterval(checkAuthInterval);
            window.authEnv.onAuthStateChanged(window.authEnv.auth, (user) => {
                if (user) {
                    currentUser = user;
                    document.getElementById('authScreen').classList.add('hidden');
                    document.getElementById('appScreen').classList.remove('hidden');
                    document.getElementById('userDisplay').innerText = user.email;
                    listenToFeed();
                } else {
                    currentUser = null;
                    document.getElementById('appScreen').classList.add('hidden');
                    document.getElementById('authScreen').classList.remove('hidden');
                }
            });
        }
    }, 500);
});

// Executar Login ou Registo
async function handleAuth() {
    const { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = window.authEnv;
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPassword').value;

    if(!email || !pass) return alert("Preencha todos os campos!");

    try {
        if (isSignUpMode) {
            await createUserWithEmailAndPassword(auth, email, pass);
            alert("Conta criada com sucesso!");
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
        }
    } catch (error) {
        alert("Erro na autenticação: " + error.message);
    }
}

function logout() {
    window.authEnv.signOut(window.authEnv.auth);
}

// Publicar Texto e Média para a Nuvem
async function submitPost() {
    const { db, storage, collection, addDoc, ref, uploadBytes, getDownloadURL } = window.authEnv;
    const text = document.getElementById('postText').value.trim();
    const fileInput = document.getElementById('postFile');
    let mediaUrl = "";

    if (!text && !fileInput.files[0]) return alert("Escreva algo ou adicione uma imagem!");

    try {
        // Se houver imagem, faz o upload para o Firebase Storage
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const storageRef = ref(storage, `posts/${Date.now()}_${file.name}`);
            const uploadResult = await uploadBytes(storageRef, file);
            mediaUrl = await getDownloadURL(uploadResult.ref);
        }

        // Guarda o documento do post no Firestore Database
        await addDoc(collection(db, "posts"), {
            author: currentUser.email,
            content: text,
            media: mediaUrl,
            timestamp: Date.now(),
            likes: [],
            comments: []
        });

        document.getElementById('postText').value = "";
        fileInput.value = "";
        alert("Publicado com sucesso!");
    } catch (error) {
        alert("Erro ao publicar: " + error.message);
    }
}

// Escutar atualizações do feed em tempo real
function listenToFeed() {
    const { db, collection, query, orderBy, onSnapshot } = window.authEnv;
    const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
        const feedWall = document.getElementById('feedWall');
        feedWall.innerHTML = '';

        snapshot.forEach((docSnap) => {
            const post = docSnap.data();
            const id = docSnap.id;
            const hasLiked = post.likes.includes(currentUser.email);

            const commentsHtml = post.comments.map(c => `
                <div class="comment-box"><strong>${c.user}:</strong> ${c.text}</div>
            `).join('');

            const postCard = document.createElement('div');
            postCard.className = 'card';
            postCard.innerHTML = `
                <div class="post-meta">👤 ${post.author}</div>
                <div style="font-size:15px; margin-bottom:10px;">${post.content}</div>
                ${post.media ? `<img src="${post.media}" class="post-img">` : ''}
                
                <div class="post-actions">
                    <button class="action-btn ${hasLiked ? 'active' : ''}" onclick="toggleLike('${id}', ${hasLiked})">
                        👍 Gosto (${post.likes.length})
                    </button>
                </div>

                <div style="margin-top:15px;">
                    <div id="comments-${id}">${commentsHtml}</div>
                    <input type="text" class="comment-input" placeholder="Escreva um comentário e prima Enter..." onkeypress="submitComment(event, '${id}')">
                </div>
            `;
            feedWall.appendChild(postCard);
        });
    });
}

// Sistema de Likes partilhado na base de dados
async function toggleLike(postId, hasLiked) {
    const { db, doc, updateDoc, arrayUnion, arrayRemove } = window.authEnv;
    const postRef = doc(db, "posts", postId);

    await updateDoc(postRef, {
        likes: hasLiked ? arrayRemove(currentUser.email) : arrayUnion(currentUser.email)
    });
}

// Sistema de Comentários partilhado na base de dados
async function submitComment(event, postId) {
    if (event.key === 'Enter' && event.target.value.trim() !== "") {
        const { db, doc, updateDoc, arrayUnion } = window.authEnv;
        const postRef = doc(db, "posts", postId);
        const commentText = event.target.value.trim();

        await updateDoc(postRef, {
            comments: arrayUnion({
                user: currentUser.email,
                text: commentText,
                time: Date.now()
            })
        });
        event.target.value = "";
    }
}
