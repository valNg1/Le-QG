package org.legeneral.pas

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId

/**
 * Application compagnon minimale : lit les pas dans Health Connect
 * (permission READ_STEPS uniquement) et les envoie vers le compte Firebase
 * de l'utilisateur. Interface construite en code : aucun fichier de layout.
 */
class MainActivity : ComponentActivity() {

    private val readSteps = HealthPermission.getReadPermission(StepsRecord::class)

    private val permissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted ->
        if (readSteps in granted) show("Autorisation accordée. Vous pouvez synchroniser.")
        else show("Autorisation refusée. Sans elle, aucun pas ne peut être lu. Vous pouvez l'accorder dans les réglages Health Connect.")
        refreshUi()
    }

    private lateinit var status: TextView
    private lateinit var who: TextView
    private lateinit var loginBox: LinearLayout
    private lateinit var email: EditText
    private lateinit var password: EditText
    private lateinit var btnLogin: Button
    private lateinit var btnPermission: Button
    private lateinit var btnSettings: Button
    private lateinit var btnSync: Button
    private lateinit var btnLogout: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        refreshUi()
    }

    override fun onResume() {
        super.onResume()
        refreshUi()
    }

    // ── Interface ────────────────────────────────────────────────────
    private fun buildUi() {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
        }
        fun btn(label: String, onClick: () -> Unit) = Button(this).apply {
            text = label
            setOnClickListener { onClick() }
        }
        root.addView(TextView(this).apply { text = "Le Général Pas"; textSize = 22f })
        who = TextView(this).apply { textSize = 14f }
        root.addView(who)

        loginBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        email = EditText(this).apply {
            hint = "Email du compte Le Général"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        password = EditText(this).apply {
            hint = "Mot de passe"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        btnLogin = btn("Se connecter") { doLogin() }
        loginBox.addView(email); loginBox.addView(password); loginBox.addView(btnLogin)
        root.addView(loginBox)

        btnPermission = btn("Autoriser la lecture des pas") { requestPermission() }
        btnSettings = btn("Ouvrir les réglages Health Connect") { openHealthConnectSettings() }
        btnSync = btn("Synchroniser maintenant") { syncNow() }
        btnLogout = btn("Se déconnecter (révoquer l'accès)") { doLogout() }
        listOf(btnPermission, btnSettings, btnSync, btnLogout).forEach { root.addView(it) }

        status = TextView(this).apply { textSize = 15f; setPadding(0, pad, 0, 0) }
        root.addView(status)
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun show(msg: String) { status.text = msg }

    private fun setBusy(busy: Boolean) {
        listOf(btnLogin, btnPermission, btnSync, btnLogout).forEach { it.isEnabled = !busy }
    }

    /** Affiche seulement les boutons utiles à l'état courant. */
    private fun refreshUi() {
        val signedIn = Auth.isSignedIn(this)
        loginBox.visibility = if (signedIn) View.GONE else View.VISIBLE
        who.text = if (signedIn) "Compte : ${Auth.email(this)}" else "Non connecté"
        btnLogout.visibility = if (signedIn) View.VISIBLE else View.GONE
        btnSync.visibility = View.GONE
        btnPermission.visibility = View.GONE
        btnSettings.visibility = View.GONE

        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_UNAVAILABLE -> {
                show("Health Connect n'est pas disponible sur cet appareil.")
                return
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                show("Installez ou mettez à jour Health Connect (Play Store), puis rouvrez l'application.")
                btnSettings.visibility = View.VISIBLE
                btnSettings.text = "Ouvrir Health Connect dans le Play Store"
                btnSettings.setOnClickListener { openStore() }
                return
            }
        }
        if (!signedIn) return
        lifecycleScope.launch {
            val granted = try {
                HealthConnectClient.getOrCreate(this@MainActivity).permissionController.getGrantedPermissions()
            } catch (e: Exception) { emptySet() }
            if (readSteps in granted) {
                btnSync.visibility = View.VISIBLE
            } else {
                btnPermission.visibility = View.VISIBLE
                btnSettings.visibility = View.VISIBLE
                btnSettings.text = "Ouvrir les réglages Health Connect"
                btnSettings.setOnClickListener { openHealthConnectSettings() }
            }
        }
    }

    // ── Actions ──────────────────────────────────────────────────────
    private fun doLogin() {
        val e = email.text.toString(); val p = password.text.toString()
        if (e.isBlank() || p.isEmpty()) { show("Saisissez l'email et le mot de passe."); return }
        setBusy(true); show("Connexion…")
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { Auth.signIn(this@MainActivity, e, p) }
                password.text.clear()
                show("Connecté. Autorisez maintenant la lecture des pas.")
            } catch (ex: AuthException) {
                show(ex.message ?: "Connexion impossible.")
            } catch (ex: Exception) {
                show("Connexion impossible : vérifiez le réseau.")
            } finally {
                setBusy(false); refreshUi()
            }
        }
    }

    private fun doLogout() {
        Auth.signOut(this)
        show("Déconnecté : le jeton de session a été effacé de ce téléphone. Pour retirer aussi la lecture des pas, utilisez les réglages Health Connect.")
        refreshUi()
    }

    private fun requestPermission() {
        permissionLauncher.launch(setOf(readSteps))
    }

    private fun openHealthConnectSettings() {
        try {
            startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))
        } catch (e: Exception) {
            show("Ouvrez Réglages Android › Applications › Health Connect › Autorisations.")
        }
    }

    private fun openStore() {
        val pkg = "com.google.android.apps.healthdata"
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")))
        } catch (e: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg")))
        }
    }

    private fun syncNow() {
        setBusy(true); show("Lecture des pas dans Health Connect…")
        lifecycleScope.launch {
            try {
                val uid = Auth.uid(this@MainActivity) ?: throw AuthException("Session absente : reconnectez-vous.")
                val client = HealthConnectClient.getOrCreate(this@MainActivity)
                if (readSteps !in client.permissionController.getGrantedPermissions()) {
                    show("Autorisation de lecture des pas absente.")
                    return@launch
                }

                val zone = ZoneId.systemDefault()
                val entries = mutableListOf<DaySteps>()
                for (day in SyncLogic.lastDays(LocalDate.now(zone), 7)) {
                    val start = day.atStartOfDay(zone).toInstant()
                    val end = day.plusDays(1).atStartOfDay(zone).toInstant()
                    val result = client.aggregate(
                        AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(start, end)),
                    )
                    val steps = result[StepsRecord.COUNT_TOTAL]
                    // Aucun enregistrement = aucune donnée : on n'envoie rien (jamais 0 inventé).
                    if (SyncLogic.isSendable(steps)) {
                        entries += DaySteps(day.toString(), steps!!, result.dataOrigins.map { it.packageName })
                    }
                }
                if (entries.isEmpty()) {
                    show(
                        "Health Connect ne contient aucun pas sur les 7 derniers jours. Rien n'a été envoyé.\n\n" +
                            "Une application doit écrire vos pas dans Health Connect (par exemple Google Fit ou Fitbit).",
                    )
                    return@launch
                }

                val device = (Build.MANUFACTURER.replaceFirstChar { it.uppercase() } + " " + Build.MODEL).trim()
                val body = SyncLogic.buildCommitBody(Config.PROJECT_ID, uid, entries, device)
                val res = withContext(Dispatchers.IO) {
                    val token = Auth.freshIdToken(this@MainActivity)
                    Firestore.commit(token, body)
                }
                if (res.ok) {
                    val today = entries.lastOrNull { it.day == LocalDate.now(zone).toString() }
                    show(
                        "Envoi réussi : ${entries.size} jour(s) synchronisé(s)." +
                            (today?.let { "\nAujourd'hui : ${it.steps} pas." } ?: "\nAucun pas enregistré pour aujourd'hui.") +
                            "\n\nOuvrez Le Général › Santé › Santé & Équilibre pour les voir.",
                    )
                } else {
                    show(Firestore.explain(res))
                }
            } catch (ex: AuthException) {
                show(ex.message ?: "Session invalide.")
                refreshUi()
            } catch (ex: SecurityException) {
                show("Lecture refusée par Health Connect : accordez l'autorisation.")
                refreshUi()
            } catch (ex: Exception) {
                show("Échec de la synchronisation : ${ex.javaClass.simpleName}. Vérifiez le réseau et réessayez.")
            } finally {
                setBusy(false)
            }
        }
    }
}
