package com.example.sbm.scheduler;

import org.jboss.logging.Logger;
import java.time.*;
import java.time.temporal.ChronoField;
import java.util.Arrays;

/**
 * Valutatore semplice di espressioni cron per il ScheduledJobLauncher.
 *
 * Formato supportato: 6 campi (stile Quarkus Scheduler).
 *
 *   sec  min  ora  giornoMese  mese  giornoSett
 *    0    0    2       *         *       ?        ogni giorno alle 02:00
 *    0    0    2,14    *         *       ?        alle 02:00 e alle 14:00
 *    0    0    0/6     *         *       ?        ogni 6 ore (00, 06, 12, 18)
 *    0   30    8       *         *      1-5       Lun-Ven alle 08:30
 *    0    0    0       1         *       ?        il primo del mese a mezzanotte
 *
 * NOTA: "* /6" (con spazio) indica "ogni 6 ore" nel Javadoc per evitare
 * che il compilatore interpreti la sequenza asterisco-slash come chiusura
 * del blocco di commento.
 *
 * La corrispondenza e verificata con granularita al minuto
 * (i secondi vengono ignorati).
 */
public class CronEvaluator {

    private static final Logger LOG = Logger.getLogger(CronEvaluator.class);

    /**
     * Restituisce true se la cron expression corrisponde
     * all'istante corrente (con granularita al minuto).
     *
     * @param cron espressione cron a 6 campi
     * @param now  istante da valutare
     */
    public static boolean shouldRunNow(String cron, Instant now) {
        if (cron == null || cron.isBlank()) return false;

        try {
            ZonedDateTime zdt = now.atZone(ZoneId.systemDefault());
            String[] parts = cron.trim().split("\\s+");
            if (parts.length < 6) {
                LOG.warnf("Cron expression malformata (attesi 6 campi): %s", cron);
                return false;
            }
            // parts: [secondi, minuti, ore, giornoMese, mese, giornoSett]
            int minute   = zdt.get(ChronoField.MINUTE_OF_HOUR);
            int hour     = zdt.get(ChronoField.HOUR_OF_DAY);
            int dayMonth = zdt.get(ChronoField.DAY_OF_MONTH);
            int month    = zdt.get(ChronoField.MONTH_OF_YEAR);
            int dayWeek  = zdt.get(ChronoField.DAY_OF_WEEK); // 1=Lun, 7=Dom (ISO)

            return matches(parts[1], minute, 0, 59)
                && matches(parts[2], hour,   0, 23)
                && matchesDayOfMonth(parts[3], dayMonth)
                && matches(parts[4], month,  1, 12)
                && matchesDayOfWeek(parts[5], dayWeek);

        } catch (Exception e) {
            LOG.warnf("Errore valutazione cron '%s': %s", cron, e.getMessage());
            return false;
        }
    }

    private static boolean matches(String field, int value, int min, int max) {
        if ("*".equals(field) || "?".equals(field)) return true;

        // Lista: "2,14,20"
        if (field.contains(",")) {
            return Arrays.stream(field.split(","))
                .anyMatch(f -> matches(f.trim(), value, min, max));
        }

        // Step: "0/6" oppure "*/6"
        if (field.contains("/")) {
            String[] s = field.split("/");
            int step  = Integer.parseInt(s[1]);
            int start = s[0].equals("*") ? min : Integer.parseInt(s[0]);
            return (value - start) >= 0 && (value - start) % step == 0;
        }

        // Range: "8-17"
        if (field.contains("-")) {
            String[] r = field.split("-");
            int from = Integer.parseInt(r[0]);
            int to   = Integer.parseInt(r[1]);
            return value >= from && value <= to;
        }

        // Valore esatto
        return Integer.parseInt(field) == value;
    }

    private static boolean matchesDayOfMonth(String field, int dayMonth) {
        if ("?".equals(field) || "*".equals(field)) return true;
        if (field.equals("L")) return true; // "L" = ultimo giorno del mese
        return matches(field, dayMonth, 1, 31);
    }

    private static boolean matchesDayOfWeek(String field, int dayWeek) {
        if ("?".equals(field) || "*".equals(field)) return true;
        return matches(field, dayWeek, 1, 7);
    }
}
