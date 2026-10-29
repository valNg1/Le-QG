package org.legeneral.pas

/**
 * Configuration PUBLIQUE du client Firebase (la même clé web que dans
 * index.html : elle identifie le projet, ce n'est pas un secret — l'accès
 * aux données est protégé par Firebase Auth + firestore.rules).
 * Aucune clé privée, aucun service account dans cette application.
 */
object Config {
    const val API_KEY = "AIzaSyBjQ72rEOs71--GgpQn7zJP24eNMGUSicU"
    const val PROJECT_ID = "le-qg-1a6e7"

    /** Au cas où la clé web serait restreinte aux référents HTTP du site. */
    const val REFERER = "https://legeneral.org/"
}
