package org.legeneral.pas

import android.content.Context
import org.json.JSONObject
import java.net.URLEncoder

class AuthException(message: String) : Exception(message)

/**
 * Connexion Firebase Auth (email + mot de passe) par l'API REST officielle.
 * Le mot de passe n'est JAMAIS conservé : seul le jeton de renouvellement
 * (refresh token) est gardé, dans les préférences privées de l'application
 * (sandbox Android, sans sauvegarde cloud). « Se déconnecter » l'efface.
 */
object Auth {
    private const val PREFS = "session"
    private val REF = mapOf("Referer" to Config.REFERER)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isSignedIn(ctx: Context) = prefs(ctx).getString("refresh", null) != null
    fun email(ctx: Context): String? = prefs(ctx).getString("email", null)
    fun uid(ctx: Context): String? = prefs(ctx).getString("uid", null)
    fun signOut(ctx: Context) { prefs(ctx).edit().clear().apply() }

    /** À appeler hors du thread principal. */
    fun signIn(ctx: Context, email: String, password: String) {
        val body = JSONObject()
            .put("email", email.trim())
            .put("password", password)
            .put("returnSecureToken", true)
            .toString()
        val res = Http.post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${Config.API_KEY}",
            body, headers = REF,
        )
        if (!res.ok) throw AuthException(explain(res))
        val j = JSONObject(res.body)
        save(ctx, j.getString("localId"), email.trim(), j.getString("idToken"), j.getString("refreshToken"), j.getString("expiresIn").toLong())
    }

    /** Jeton d'identité valide (renouvelé si besoin). Hors thread principal. */
    fun freshIdToken(ctx: Context): String {
        val p = prefs(ctx)
        val cached = p.getString("idToken", null)
        if (cached != null && System.currentTimeMillis() < p.getLong("expiresAt", 0) - 60_000) return cached
        val refresh = p.getString("refresh", null) ?: throw AuthException("Session absente : reconnectez-vous.")
        val form = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8")
        val res = Http.post(
            "https://securetoken.googleapis.com/v1/token?key=${Config.API_KEY}",
            form, contentType = "application/x-www-form-urlencoded", headers = REF,
        )
        if (!res.ok) {
            signOut(ctx)
            throw AuthException("Session expirée ou révoquée : reconnectez-vous.")
        }
        val j = JSONObject(res.body)
        save(ctx, j.getString("user_id"), p.getString("email", "") ?: "", j.getString("id_token"), j.getString("refresh_token"), j.getString("expires_in").toLong())
        return j.getString("id_token")
    }

    private fun save(ctx: Context, uid: String, email: String, idToken: String, refresh: String, expiresInSec: Long) {
        prefs(ctx).edit()
            .putString("uid", uid).putString("email", email)
            .putString("idToken", idToken).putString("refresh", refresh)
            .putLong("expiresAt", System.currentTimeMillis() + expiresInSec * 1000)
            .apply()
    }

    private fun explain(res: HttpResult): String {
        val msg = try { JSONObject(res.body).getJSONObject("error").getString("message") } catch (e: Exception) { "" }
        return when {
            msg.contains("INVALID_LOGIN_CREDENTIALS") || msg.contains("INVALID_PASSWORD") || msg.contains("EMAIL_NOT_FOUND") ->
                "Email ou mot de passe incorrect."
            msg.contains("TOO_MANY_ATTEMPTS") -> "Trop de tentatives. Réessayez plus tard."
            msg.contains("API_KEY_HTTP_REFERRER_BLOCKED") || res.code == 403 ->
                "Clé Firebase refusée pour cette application (restriction de clé). Voir le README."
            else -> "Connexion impossible (code ${res.code})."
        }
    }
}
