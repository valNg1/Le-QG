package org.legeneral.pas

import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity

/** Écran exigé par Health Connect : pourquoi l'application lit les pas. */
class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tv = TextView(this).apply {
            setPadding(48, 96, 48, 48)
            textSize = 16f
            text = "Le Général Pas lit uniquement votre nombre de pas dans Health Connect.\n\n" +
                "• Les pas des 7 derniers jours sont envoyés vers VOTRE compte Le Général, lorsque vous appuyez sur « Synchroniser maintenant ».\n" +
                "• Ces données sont strictement personnelles : les autres membres du foyer et les administrateurs ne peuvent pas les lire.\n" +
                "• Aucune autre donnée de santé n'est lue.\n" +
                "• Vous pouvez retirer l'autorisation à tout moment dans les réglages Health Connect, et supprimer les données envoyées depuis le module « Santé & Équilibre » du Général."
        }
        setContentView(ScrollView(this).apply { addView(tv) })
    }
}
