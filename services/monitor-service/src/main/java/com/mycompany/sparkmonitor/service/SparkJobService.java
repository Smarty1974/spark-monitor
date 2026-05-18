package com.mycompany.sparkmonitor.service;

import com.mycompany.sparkmonitor.dto.SparkJobDTO;
import com.mycompany.sparkmonitor.repository.SparkJobRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class SparkJobService {

    @Inject SparkJobRepository repository;

    public List<SparkJobDTO> findAll(int page, int size, String sort, String order) {
        return repository.findAll(page, size, sort, order)
            .stream().map(SparkJobDTO::from).toList();
    }

    public long count() { return repository.count(); }

    public Optional<SparkJobDTO> findById(Long id) {
        return repository.findById(id).map(SparkJobDTO::from);
    }

    public SparkJobDTO create(SparkJobDTO dto) {
        return SparkJobDTO.from(repository.create(dto.toEntity()));
    }

    public Optional<SparkJobDTO> update(Long id, SparkJobDTO dto) {
        return repository.update(id, dto.toEntity()).map(SparkJobDTO::from);
    }

    public boolean delete(Long id) { return repository.delete(id); }

    public List<SparkJobDTO> search(String q, int page, int size) {
        return repository.search(q, page, size)
            .stream().map(SparkJobDTO::from).toList();
    }
}
