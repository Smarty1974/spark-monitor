package com.example.sbm.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

/**
 * Servizio di notifica - stub MVP.
 *
 * Estendere in produzione con:
 * - Google Cloud Pub/Sub (eventi asincroni)
 * - SendGrid/SMTP (email alert)
 * - Slack Webhook (notifiche operative)
 * - PagerDuty (alerting on-call)
 */
@ApplicationScoped
public class NotificationService {

    private static final Logger LOG = Logger.getLogger(NotificationService.class);

    public void sendTimeoutAlert(String processId, String fileName, long ageMinutes) {
        LOG.warnf("[ALERT] [ALERT] TIMEOUT - processId=%s | file=%s | eta=%d min -> forzato FAILED",
            processId, fileName, ageMinutes);
        // TODO: pubSubPublisher.publish(TimeoutAlert.of(processId, fileName, ageMinutes));
    }

    public void sendFailureAlert(String processId, String fileName, String reason) {
        LOG.warnf("[ALERT] [ALERT] FAILURE - processId=%s | file=%s | motivo=%s",
            processId, fileName, reason);
        // TODO: slackWebhook.send(FailureAlert.of(processId, fileName, reason));
    }

    public void sendCompletionNotification(String processId, String fileName) {
        LOG.infof("[OK] [NOTIFY] COMPLETED - processId=%s | file=%s", processId, fileName);
        // TODO: pubSubPublisher.publish(CompletionEvent.of(processId, fileName));
    }
}
