package com.mycompany.sparkmonitor.service;

import com.mycompany.sparkmonitor.dto.SparkJobExecutionDTO;
import com.mycompany.sparkmonitor.repository.SparkJobExecutionRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class SparkJobExecutionService {

    @Inject SparkJobExecutionRepository repository;

    public List<SparkJobExecutionDTO> findAll(int page, int size, String sort, String order) {
        return repository.findAll(page, size, sort, order)
            .stream().map(SparkJobExecutionDTO::from).toList();
    }

    public long count() { return repository.count(); }

    public Optional<SparkJobExecutionDTO> findById(Long id) {
        return repository.findById(id).map(SparkJobExecutionDTO::from);
    }

    public List<SparkJobExecutionDTO> findBySparkJobId(Long sparkJobId, int page, int size) {
        return repository.findBySparkJobId(sparkJobId, page, size)
            .stream().map(SparkJobExecutionDTO::from).toList();
    }

    public SparkJobExecutionDTO create(SparkJobExecutionDTO dto) {
        return SparkJobExecutionDTO.from(repository.create(dto.toEntity()));
    }

    public Optional<SparkJobExecutionDTO> update(Long id, SparkJobExecutionDTO dto) {
        return repository.update(id, dto.toEntity()).map(SparkJobExecutionDTO::from);
    }

    public boolean delete(Long id) { return repository.delete(id); }
}
