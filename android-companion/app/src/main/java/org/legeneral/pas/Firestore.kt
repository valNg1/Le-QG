package org.legeneral.pas

/** Envoi atomique vers Firestore (REST officiel), authentifié par le jeton de l'utilisateur. */
object Firestore {
    fun commit(idToken: String, body: String): HttpResult = Http.post(
        "https://firestore.googleapis.com/v1/projects/${Config.PROJECT_ID}/databases/(default)/documents:commit",
        body,
        headers = mapOf("Authorization" to "Bearer $idToken"),
    )

    fun explain(res: HttpResult): String = when (res.code) {
        401 -> "Session refusée : reconnectez-vous."
        403 -> "Refusé par les règles Firestore. Les règles « Santé & Équilibre » sont-elles publiées dans la Console Firebase ?"
        else -> "Échec de l'envoi (code ${res.code})."
    }
}
