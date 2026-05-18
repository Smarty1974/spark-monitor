package com.mycompany.sparkmonitor.resource;

import com.mycompany.sparkmonitor.dto.SparkJobDTO;
import com.mycompany.sparkmonitor.service.SparkJobService;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import java.util.List;

@Path("/spark-jobs")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "SparkJobs", description = "Gestione job Apache Spark")
public class SparkJobResource {

    @Inject SparkJobService service;

    @GET
    @Operation(summary = "Lista paginata dei job Spark")
    public Response list(
        @QueryParam("page")  @DefaultValue("0")   int page,
        @QueryParam("size")  @DefaultValue("20")  int size,
        @QueryParam("sort")  @DefaultValue("id")  String sort,
        @QueryParam("order") @DefaultValue("desc") String order
    ) {
        List<SparkJobDTO> items = service.findAll(page, size, sort, order);
        long total = service.count();
        return Response.ok(items)
            .header("X-Total-Count", total)
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }

    @GET
    @Path("/{id}")
    @Operation(summary = "Recupera un job per ID")
    public Response getById(@PathParam("id") Long id) {
        return service.findById(id)
            .map(dto -> Response.ok(dto).build())
            .orElse(Response.status(404).entity(new ErrorResponse("SparkJob non trovato: " + id)).build());
    }

    @POST
    @Operation(summary = "Crea un nuovo job Spark")
    public Response create(@Valid SparkJobDTO dto) {
        SparkJobDTO created = service.create(dto);
        return Response.status(201).entity(created).build();
    }

    @PUT
    @Path("/{id}")
    @Operation(summary = "Aggiorna un job Spark")
    public Response update(@PathParam("id") Long id, @Valid SparkJobDTO dto) {
        return service.update(id, dto)
            .map(updated -> Response.ok(updated).build())
            .orElse(Response.status(404).entity(new ErrorResponse("SparkJob non trovato: " + id)).build());
    }

    @DELETE
    @Path("/{id}")
    @Operation(summary = "Elimina (soft) un job Spark")
    public Response delete(@PathParam("id") Long id) {
        return service.delete(id)
            ? Response.noContent().build()
            : Response.status(404).entity(new ErrorResponse("SparkJob non trovato: " + id)).build();
    }

    @GET
    @Path("/search")
    @Operation(summary = "Ricerca job per nome")
    public Response search(
        @QueryParam("q")     String q,
        @QueryParam("page")  @DefaultValue("0")  int page,
        @QueryParam("size")  @DefaultValue("20") int size
    ) {
        if (q == null || q.isBlank())
            return Response.status(400).entity(new ErrorResponse("Parametro 'q' obbligatorio")).build();
        List<SparkJobDTO> results = service.search(q, page, size);
        return Response.ok(results)
            .header("X-Total-Count", results.size())
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }
}
