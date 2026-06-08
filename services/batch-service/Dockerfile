# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /app

# Copia pom.xml. Il BOM viene scaricato prima di tutto il resto
# grazie a dependency:resolve-plugins che forza la risoluzione del plugin BOM.
COPY pom.xml .

# Primo passaggio: scarica il BOM e tutte le dipendenze dichiarate.
# -Dquarkus.native.enabled=false impedisce che il plugin cerchi
# platform.quarkus.native.builder-image (che richiede variabili di piattaforma).
# Il || true è intenzionale: senza sorgenti il build fallisce ma le deps sono in cache.
RUN mvn -B -ntp \
    -Dquarkus.native.enabled=false \
    -Dquarkus.package.jar.type=fast-jar \
    -Dquarkus.analytics.disabled=true \
    -Dmaven.test.skip=true \
    dependency:resolve \
    dependency:resolve-plugins \
    || true

# Secondo passaggio: build reale con i sorgenti.
# -U forza il retry dei download eventualmente falliti nel primo passaggio.
COPY src ./src
RUN mvn -B -ntp -U \
    -Dquarkus.native.enabled=false \
    -Dquarkus.package.jar.type=fast-jar \
    -Dquarkus.analytics.disabled=true \
    -Dmaven.test.skip=true \
    package

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY --from=build /app/target/quarkus-app/lib/      ./quarkus-app/lib/
COPY --from=build /app/target/quarkus-app/*.jar     ./quarkus-app/
COPY --from=build /app/target/quarkus-app/app/      ./quarkus-app/app/
COPY --from=build /app/target/quarkus-app/quarkus/  ./quarkus-app/quarkus/

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD wget -qO- http://localhost:8080/q/health/ready || exit 1

ENTRYPOINT ["java", \
  "-Djava.util.logging.manager=org.jboss.logmanager.LogManager", \
  "-jar", "./quarkus-app/quarkus-run.jar"]
